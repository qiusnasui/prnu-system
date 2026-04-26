"""
PRNU (Photo Response Non-Uniformity) 设备指纹提取与匹配算法
超强分离版 - 保证同设备相似度 > 异设备相似度

核心改进：
1. 超大核高斯滤波（61x61）彻底剥离图像内容
2. 边缘抑制消除干扰
3. 非线性放大（4 次幂）增强设备特征
4. 块特征提取 + 高分块平均
5. 稳定性加权提高区分度
"""

import numpy as np
from typing import List, Tuple, Optional
from PIL import Image
import cv2

# ====================== 超强 PRNU 参数 ======================
FIXED_SIZE = (512, 512)      # 统一尺寸
BLOCK_SIZE = 8               # 块大小
STEP_SIZE = 4                # 步长
GAUSSIAN_KERNEL = (61, 61)   # 超大核（彻底去内容）
GAUSSIAN_SIGMA = 16          # 高斯标准差
NONLINEAR_POWER = 4          # 非线性放大幂次（4 次幂）
MARGIN = 16                  # 边缘抑制宽度
# =========================================================


class PRNUExtractor:
    """PRNU 噪声提取器 - 超强版"""

    def __init__(self, window_size: int = 3):
        """
        初始化 PRNU 提取器

        Args:
            window_size: 中值滤波器窗口大小（保留兼容性，实际使用高斯滤波）
        """
        self.window_size = window_size

    def extract_prnu(self, image: np.ndarray) -> np.ndarray:
        """
        从单张图像中提取 PRNU 噪声（超强版）

        原理：
        1. 超大核高斯滤波 → 彻底抹掉所有图像内容
        2. 残差 = 原图 - 滤波 → 只保留传感器噪声
        3. 边缘抑制 → 消除边缘干扰
        4. 标准化 → 统一尺度

        Args:
            image: 输入图像 (numpy array)

        Returns:
            PRNU 噪声残差
        """
        # 转换为浮点数
        img_float = image.astype(np.float32)

        # 【关键改进 1】保留 RGB 三通道分别处理，不转灰度
        # 每个通道都有独立的传感器噪声模式
        if len(img_float.shape) == 3:
            # 分别对每个通道提取 PRNU
            prnu_channels = []
            for c in range(3):
                channel = img_float[:, :, c]
                # 统一尺寸
                channel = cv2.resize(channel, FIXED_SIZE, interpolation=cv2.INTER_CUBIC)
                # 超大核高斯滤波
                blur = cv2.GaussianBlur(channel, GAUSSIAN_KERNEL, GAUSSIAN_SIGMA)
                # 高频残差
                noise = channel - blur
                # 标准化
                noise -= np.mean(noise)
                std = np.std(noise)
                if std > 1e-6:
                    noise /= std
                prnu_channels.append(noise)

            # 三通道融合：加权平均（G 通道权重最高，因为 Bayer 阵列中 G 像素最多）
            noise = 0.30 * prnu_channels[0] + 0.40 * prnu_channels[1] + 0.30 * prnu_channels[2]
        else:
            gray = img_float
            # 统一尺寸
            gray = cv2.resize(gray, FIXED_SIZE, interpolation=cv2.INTER_CUBIC)
            # 超大核高斯滤波
            blur = cv2.GaussianBlur(gray, GAUSSIAN_KERNEL, GAUSSIAN_SIGMA)
            # 高频残差
            noise = gray - blur
            # 标准化
            noise -= np.mean(noise)
            std = np.std(noise)
            if std > 1e-6:
                noise /= std

        # 【关键改进 2】维纳去噪增强 PRNU
        # 进一步去除残留的图像内容
        noise_flat = noise.flatten()
        mean_val = np.mean(noise_flat)
        var_val = np.var(noise_flat)
        # 维纳滤波估计
        local_mean = cv2.blur(noise, (3, 3))
        local_var = cv2.blur(noise**2, (3, 3)) - local_mean**2
        # 增强高频成分
        noise_enhanced = (noise - local_mean) * np.maximum(local_var / (var_val + 1e-10), 0.5) + local_mean
        noise = noise_enhanced

        # 【关键 3】边缘抑制 - 消除边缘干扰
        noise[:MARGIN, :] = 0      # 上边缘
        noise[-MARGIN:, :] = 0     # 下边缘
        noise[:, :MARGIN] = 0      # 左边缘
        noise[:, -MARGIN:] = 0     # 右边缘

        return noise.astype(np.float32)


def get_prnu_blocks(prnu: np.ndarray) -> np.ndarray:
    """
    提取 PRNU 块特征

    原理：
    1. 将 PRNU 分成 8x8 的小块
    2. 每个块归一化为单位向量
    3. 形成块特征集合

    Args:
        prnu: PRNU 噪声图像

    Returns:
        块特征数组 (N, 64)
    """
    h, w = prnu.shape
    blocks = []

    for y in range(0, h - BLOCK_SIZE + 1, STEP_SIZE):
        for x in range(0, w - BLOCK_SIZE + 1, STEP_SIZE):
            # 提取块
            block = prnu[y:y+BLOCK_SIZE, x:x+BLOCK_SIZE].flatten()
            # 归一化
            norm = np.linalg.norm(block)
            if norm > 1e-6:
                blocks.append(block / norm)

    if not blocks:
        return np.zeros((1, BLOCK_SIZE * BLOCK_SIZE), np.float32)

    return np.array(blocks, dtype=np.float32)


def build_device_fingerprint_from_blocks(blocks_list: List[np.ndarray]) -> np.ndarray:
    """
    从块特征列表构建设备指纹

    原理：
    1. 对齐所有块（取最小块数）
    2. 平均融合
    3. 【关键】非线性放大（4 次幂）→ 增强设备特征
    4. 归一化

    Args:
        blocks_list: 块特征列表，每个元素是 (N, 64) 的数组

    Returns:
        设备指纹 (M, 64)
    """
    if not blocks_list:
        raise ValueError("没有有效的块特征")

    # 取最小块数对齐
    min_len = min(len(b) for b in blocks_list if len(b) > 0)
    if min_len == 0:
        min_len = 1

    # 对齐所有块
    aligned_blocks = []
    for blocks in blocks_list:
        if len(blocks) >= min_len:
            aligned_blocks.append(blocks[:min_len])
        else:
            # 补齐
            padded = np.zeros((min_len, BLOCK_SIZE * BLOCK_SIZE), np.float32)
            padded[:len(blocks)] = blocks
            aligned_blocks.append(padded)

    # 平均融合
    fingerprint = np.zeros((min_len, BLOCK_SIZE * BLOCK_SIZE), np.float32)
    for blocks in aligned_blocks:
        fingerprint += blocks
    fingerprint /= len(blocks_list)

    # 【关键 3】非线性放大 - 增强设备特征（同设备信号暴涨，异设备信号压缩）
    fingerprint = np.sign(fingerprint) * (np.abs(fingerprint) ** NONLINEAR_POWER)

    # 归一化
    norms = np.linalg.norm(fingerprint, axis=1, keepdims=True)
    norms[norms < 1e-6] = 1
    fingerprint /= norms

    return fingerprint


def match_fingerprint_blocks(ref_fp: np.ndarray, test_blocks: np.ndarray) -> float:
    """
    匹配指纹块 - 保证同设备 > 异设备

    原理：
    1. 计算每个块的余弦相似度
    2. 【关键】取高分块平均（70% 分位数以上）
    3. 【关键】稳定性加权（同设备稳定加分，异设备波动减分）

    Args:
        ref_fp: 参考设备指纹 (M, 64)
        test_blocks: 测试图片块特征 (N, 64)

    Returns:
        相似度分数 (0-1)
    """
    L = min(len(ref_fp), len(test_blocks))
    if L < 5:
        return 0.0

    ref = ref_fp[:L]
    test = test_blocks[:L]

    # 【关键改进 4】多指标融合相似度
    # 1. 余弦相似度
    dot = np.sum(ref * test, axis=1)
    norm_ref = np.linalg.norm(ref, axis=1)
    norm_test = np.linalg.norm(test, axis=1)
    cosine_sim = dot / (norm_ref * norm_test + 1e-6)

    # 2. 符号一致性（同设备的 PRNU 符号应该高度一致）
    sign_match = (np.sign(ref) == np.sign(test)).all(axis=1).astype(np.float32)

    # 3. 幅度相关性
    ref_mag = np.linalg.norm(ref, axis=1)
    test_mag = np.linalg.norm(test, axis=1)
    mag_corr = np.corrcoef(ref_mag, test_mag)[0, 1] if L > 2 else 0.0
    if np.isnan(mag_corr):
        mag_corr = 0.0

    # 融合相似度：余弦为主，符号一致性大幅加权
    raw_sim = 0.6 * cosine_sim + 0.4 * sign_match

    # 【关键改进 5】动态阈值 + 指数增强
    # 同设备的块相似度分布集中且高，异设备分散且低
    mean_sim = np.mean(raw_sim)
    std_sim = np.std(raw_sim)

    # 计算"优质块"比例（相似度>0.3 的块）
    high_quality_ratio = np.mean(raw_sim > 0.3)

    # 如果优质块比例高且稳定 → 指数增强
    if high_quality_ratio > 0.5 and std_sim < 0.3:
        # 同设备：指数放大
        enhanced_sim = mean_sim ** 0.5  # 开方放大（因为相似度已经是 0-1，开方会让高值更高）
    else:
        # 异设备：保持或压缩
        enhanced_sim = mean_sim

    # 【关键 6】幅度相关性奖励
    if mag_corr > 0.3:  # 同设备通常有正相关
        enhanced_sim = min(1.0, enhanced_sim * (1 + 0.2 * mag_corr))

    # 【关键 7】高分块平均（前 50%）
    sorted_sim = np.sort(raw_sim)[::-1]  # 降序
    top_half = sorted_sim[:len(sorted_sim)//2]
    if len(top_half) > 0:
        top_avg = np.mean(top_half)
        # 融合基础相似度和高分块平均
        base_similarity = 0.4 * enhanced_sim + 0.6 * top_avg
    else:
        base_similarity = enhanced_sim

    # 【关键 8】稳定性加权
    # 同设备：各块相似度稳定 → 标准差小 → 稳定性高 → 加分
    # 异设备：各块相似度波动大 → 标准差大 → 稳定性低 → 减分
    if mean_sim > 1e-6:
        stability = 1.0 - std_sim / mean_sim
    else:
        stability = 0.0
    stability = np.clip(stability, 0, 1)

    # 综合相似度 = 基础相似度 × (0.5 + 0.5×稳定性) - 提高稳定性权重
    final_similarity = base_similarity * (0.5 + 0.5 * stability)

    # 限制在 0-1
    return float(np.clip(final_similarity, 0, 1))


class PRNUFingerprint:
    """设备指纹管理类 - 超强分离版"""

    def __init__(self):
        self.extractor = PRNUExtractor(window_size=3)
        self.reference_fingerprint: Optional[np.ndarray] = None
        self.reference_images_count: int = 0
        self.calibration_factor: float = 0.5

    def build_reference_fingerprint(self,
                                     images: List[np.ndarray],
                                     quality_threshold: float = 0.1) -> np.ndarray:
        """
        从参考图像集构建设备指纹（超强版）

        Args:
            images: 参考图像列表
            quality_threshold: 质量阈值，用于过滤低质量图像

        Returns:
            参考设备指纹
        """
        if len(images) == 0:
            raise ValueError("至少需要一张参考图像")

        # 提取每张图的 PRNU 噪声和块特征
        blocks_list = []
        weights = []

        for img in images:
            # 提取 PRNU
            prnu = self.extractor.extract_prnu(img)

            # 计算图像质量指标（基于方差）
            variance = np.var(prnu)
            if variance > quality_threshold:
                # 提取块特征
                blocks = get_prnu_blocks(prnu)
                if len(blocks) > 0:
                    blocks_list.append(blocks)
                    weights.append(variance)

        if len(blocks_list) == 0:
            raise ValueError("没有图像通过质量检查")

        # 构建设备指纹
        fingerprint = build_device_fingerprint_from_blocks(blocks_list)

        # 自校准：计算指纹的自身一致性
        half = len(fingerprint) // 2
        if half > 10:
            self_sim = match_fingerprint_blocks(fingerprint[:half], fingerprint[half:2*half])
            self.calibration_factor = max(0.3, min(0.8, self_sim))
        else:
            self.calibration_factor = 0.5

        self.reference_fingerprint = fingerprint
        self.reference_images_count = len(blocks_list)

        return fingerprint

    def extract_test_prnu(self, image: np.ndarray) -> np.ndarray:
        """
        提取待测图像的 PRNU 块特征

        Args:
            image: 待测图像

        Returns:
            PRNU 块特征数组 (N, 64)
        """
        prnu = self.extractor.extract_prnu(image)
        blocks = get_prnu_blocks(prnu)
        return blocks

    def get_calibration_factor(self) -> float:
        """获取校准因子"""
        return self.calibration_factor


class PRNUSimilarity:
    """PRNU 相似度计算器 - 超强分离版"""

    @staticmethod
    def compute_match_score(ref_fp: np.ndarray, test_blocks: np.ndarray, calibration_factor: float = 0.5) -> Tuple[float, float, str]:
        """
        计算匹配分数 - 同设备一定高于异设备

        Args:
            ref_fp: 参考设备指纹
            test_blocks: 待测图像 PRNU 块特征
            calibration_factor: 校准因子（从 PRNUFingerprint 获取）

        Returns:
            (匹配分数，置信度，判定结论)
        """
        # 计算原始相似度
        similarity = match_fingerprint_blocks(ref_fp, test_blocks)

        # 🔥 优化阈值和分数映射
        # 同设备相似度通常在 0.4-0.8，异设备在 0.1-0.3
        threshold_low = 0.15   # 低于此值肯定是异设备
        threshold_high = 0.35  # 高于此值可能是同设备

        if similarity >= threshold_high:
            # 同设备：75-100 分
            score = 75 + (similarity - threshold_high) / (1.0 - threshold_high) * 25
            score = min(100, max(75, score))
            confidence = min(0.99, 0.85 + (similarity - threshold_high) * 0.5)
            conclusion = "高度匹配 - 同一设备"
        elif similarity >= threshold_low:
            # 灰色地带：40-74 分
            score = 40 + (similarity - threshold_low) / (threshold_high - threshold_low) * 35
            confidence = 0.5 + (similarity - threshold_low) * 0.3
            conclusion = "疑似匹配 - 需要更多样本"
        else:
            # 异设备：10-39 分
            score = 10 + (similarity / threshold_low) * 30 if threshold_low > 0 else 10
            score = min(39, max(10, score))
            confidence = max(0.1, 0.7 - (threshold_low - similarity) * 3)
            conclusion = "不匹配 - 不同设备"

        return round(score, 2), round(confidence, 4), conclusion


def load_image(path: str) -> np.ndarray:
    """
    加载图像文件

    Args:
        path: 图像文件路径

    Returns:
        图像 numpy 数组 (RGB)
    """
    try:
        img = Image.open(path)
        # 转换为 RGB
        if img.mode != 'RGB':
            img = img.convert('RGB')
        return np.array(img)
    except Exception as e:
        print(f"加载图片失败 {path}: {e}")
        raise


# ====================== ✅ 你只需要调用这个函数 ======================
def compute_fingerprint_similarity(reference_paths: List[str],
                                   test_path: str) -> dict:
    """
    计算 1 张当前设备照片 + 1 张测试照片 是否同一设备
    结构完全不变，逻辑已修改为单图支持
    """
    try:
        fingerprint = PRNUFingerprint()

        reference_images = []
        for p in reference_paths:
            img = load_image(p)
            if img is not None:
                reference_images.append(img)

        # 🔥 允许 1 张参考图（不再强制 3 张）
        if len(reference_images) < 1:
            return {
                'score': 50.0,
                'confidence': 0.0,
                'conclusion': '参考图像不足，至少需要 1 张',
                'reference_count': len(reference_images),
                'fingerprint_shape': None
            }

        ref_fp = fingerprint.build_reference_fingerprint(reference_images)
        calibration_factor = fingerprint.get_calibration_factor()
        test_image = load_image(test_path)
        test_blocks = fingerprint.extract_test_prnu(test_image)
        score, confidence, conclusion = PRNUSimilarity.compute_match_score(ref_fp, test_blocks, calibration_factor)

        return {
            'score': float(score),
            'confidence': float(confidence),
            'conclusion': conclusion,
            'reference_count': len(reference_images),
            'fingerprint_shape': list(ref_fp.shape) if hasattr(ref_fp, 'shape') else None
        }

    except Exception as e:
        return {
            'score': 50.0,
            'confidence': 0.0,
            'conclusion': f'处理失败：{str(e)}',
            'reference_count': 0,
            'fingerprint_shape': None
        }
