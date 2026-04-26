import numpy as np
from typing import List, Tuple, Optional
from PIL import Image
import cv2

# ====================== 高准确率参数优化（仅改数值，无任何新增） ======================
FIXED_SIZE = (512, 512)
BLOCK_SIZE = 8
STEP_SIZE = 2
GAUSSIAN_KERNEL = (3, 3)
GAUSSIAN_SIGMA = 0.7
NONLINEAR_POWER = 1.4
MARGIN = 20
# ==================================================================================

class PRNUExtractor:
    def __init__(self, window_size: int = 3):
        self.window_size = window_size

    def extract_prnu(self, image: np.ndarray) -> np.ndarray:
        img_float = image.astype(np.float32)

        if len(img_float.shape) == 3:
            gray = 0.299 * img_float[:, :, 0] + 0.587 * img_float[:, :, 1] + 0.114 * img_float[:, :, 2]
        else:
            gray = img_float

        gray = cv2.resize(gray, FIXED_SIZE, interpolation=cv2.INTER_CUBIC)
        blur = cv2.GaussianBlur(gray, GAUSSIAN_KERNEL, GAUSSIAN_SIGMA)
        noise = gray - blur

        noise -= np.mean(noise)
        std = np.std(noise)
        if std > 1e-6:
            noise /= std

        noise[:MARGIN, :] = 0
        noise[-MARGIN:, :] = 0
        noise[:, :MARGIN] = 0
        noise[:, -MARGIN:] = 0

        return noise.astype(np.float32)


def get_prnu_blocks(prnu: np.ndarray) -> np.ndarray:
    h, w = prnu.shape
    blocks = []

    for y in range(0, h - BLOCK_SIZE + 1, STEP_SIZE):
        for x in range(0, h - BLOCK_SIZE + 1, STEP_SIZE):
            block = prnu[y:y+BLOCK_SIZE, x:x+BLOCK_SIZE].flatten()
            norm = np.linalg.norm(block)
            if norm > 1e-6:
                blocks.append(block / norm)

    if not blocks:
        return np.zeros((1, BLOCK_SIZE * BLOCK_SIZE), np.float32)

    return np.array(blocks, dtype=np.float32)


def build_device_fingerprint_from_blocks(blocks_list: List[np.ndarray]) -> np.ndarray:
    if not blocks_list:
        raise ValueError("没有有效的块特征")

    min_len = min(len(b) for b in blocks_list if len(b) > 0)
    if min_len == 0:
        min_len = 1

    aligned_blocks = []
    for blocks in blocks_list:
        if len(blocks) >= min_len:
            aligned_blocks.append(blocks[:min_len])
        else:
            padded = np.zeros((min_len, BLOCK_SIZE * BLOCK_SIZE), np.float32)
            padded[:len(blocks)] = blocks
            aligned_blocks.append(padded)

    fingerprint = np.mean(aligned_blocks, axis=0)
    fingerprint = np.sign(fingerprint) * (np.abs(fingerprint) ** NONLINEAR_POWER)

    norms = np.linalg.norm(fingerprint, axis=1, keepdims=True)
    norms[norms < 1e-6] = 1
    fingerprint /= norms

    return fingerprint


def match_fingerprint_blocks(ref_fp: np.ndarray, test_blocks: np.ndarray) -> float:
    L = min(len(ref_fp), len(test_blocks))
    if L < 20:
        return 0.0

    ref = ref_fp[:L]
    test = test_blocks[:L]

    dot = np.sum(ref * test, axis=1)
    norm_ref = np.linalg.norm(ref, axis=1)
    norm_test = np.linalg.norm(test, axis=1)
    similarities = dot / (norm_ref * norm_test + 1e-6)

    high_sim = similarities[similarities > np.percentile(similarities, 50)]
    return float(np.mean(high_sim)) if len(high_sim) > 0 else float(np.mean(similarities))



class PRNUFingerprint:
    def __init__(self):
        self.extractor = PRNUExtractor(window_size=3)
        self.reference_fingerprint: Optional[np.ndarray] = None
        self.reference_images_count: int = 0
        self.calibration_factor: float = 0.5

    def build_reference_fingerprint(self, images: List[np.ndarray], quality_threshold: float = 0.1) -> np.ndarray:
        if len(images) == 0:
            raise ValueError("至少需要一张参考图像")

        blocks_list = []
        for img in images:
            prnu = self.extractor.extract_prnu(img)
            variance = np.var(prnu)
            if variance > quality_threshold:
                blocks = get_prnu_blocks(prnu)
                if len(blocks) > 0:
                    blocks_list.append(blocks)

        if len(blocks_list) == 0:
            raise ValueError("没有图像通过质量检查")

        fingerprint = build_device_fingerprint_from_blocks(blocks_list)

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
        prnu = self.extractor.extract_prnu(image)
        blocks = get_prnu_blocks(prnu)
        return blocks

    def get_calibration_factor(self) -> float:
        return self.calibration_factor


class PRNUSimilarity:
    @staticmethod
    def compute_match_score(ref_fp: np.ndarray, test_blocks: np.ndarray, calibration_factor: float = 0.5) -> Tuple[float, float, str]:
        similarity = match_fingerprint_blocks(ref_fp, test_blocks)

        threshold = 0.14 * calibration_factor

        norm = (similarity - threshold) / (1.0 - threshold)
        norm = np.clip(norm, 0, 1)

        score = norm * 100 * 15
        score = float(np.clip(score, 0, 100))

        confidence = min(0.98, 0.85 + (similarity - threshold) * 0.3)
        conclusion = "高度匹配 - 同一设备" if score >= 80 else "不匹配 - 不同设备"

        return round(score, 2), round(confidence, 4), conclusion

    @staticmethod
    def get_similarity_details(ref_fp: np.ndarray, test_blocks: np.ndarray) -> dict:
        L = min(len(ref_fp), len(test_blocks))
        if L < 20:
            return {
                'total_blocks': L,
                'similar_blocks': [],
                'similarity_distribution': [],
                'grid_info': {
                    'rows': 0,
                    'cols': 0,
                    'block_size': BLOCK_SIZE,
                    'step_size': STEP_SIZE
                }
            }

        ref = ref_fp[:L]
        test = test_blocks[:L]

        dot = np.sum(ref * test, axis=1)
        norm_ref = np.linalg.norm(ref, axis=1)
        norm_test = np.linalg.norm(test, axis=1)
        similarities = dot / (norm_ref * norm_test + 1e-6)

        h, w = FIXED_SIZE
        grid_cols = (w - BLOCK_SIZE) // STEP_SIZE + 1
        grid_rows = (h - BLOCK_SIZE) // STEP_SIZE + 1

        median_sim = np.median(similarities)
        threshold_sim = median_sim
        similar_indices = np.where(similarities > threshold_sim)[0]

        similar_blocks = []
        for idx in similar_indices:
            row = idx // grid_cols
            col = idx % grid_cols
            x = col * STEP_SIZE
            y = row * STEP_SIZE
            similar_blocks.append({
                'index': int(idx),
                'x': int(x),
                'y': int(y),
                'similarity': float(round(similarities[idx], 4))
            })

        similar_blocks.sort(key=lambda b: b['similarity'], reverse=True)
        top_similar_blocks = similar_blocks[:50]

        high_sim = similarities[similarities > np.percentile(similarities, 50)]
        low_sim = similarities[similarities <= np.percentile(similarities, 50)]

        return {
            'total_blocks': L,
            'similar_blocks': top_similar_blocks,
            'high_similarity_count': int(len(high_sim)),
            'low_similarity_count': int(len(low_sim)),
            'average_similarity': float(round(np.mean(high_sim), 4)),
            'median_similarity': float(round(np.median(similarities), 4)),
            'max_similarity': float(round(np.max(similarities), 4)),
            'grid_info': {
                'rows': int(grid_rows),
                'cols': int(grid_cols),
                'block_size': BLOCK_SIZE,
                'step_size': STEP_SIZE,
                'image_width': w,
                'image_height': h
            }
        }


def load_image(path: str) -> np.ndarray:
    try:
        img = Image.open(path)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        return np.array(img)
    except Exception as e:
        print(f"加载图片失败 {path}: {e}")
        raise


def compute_fingerprint_similarity(reference_paths: List[str], test_path: str) -> dict:
    try:
        fingerprint = PRNUFingerprint()
        reference_images = [load_image(p) for p in reference_paths]

        if len(reference_images) < 1:
            return {'score': 50.0, 'confidence': 0.0, 'conclusion': '至少需要 1 张参考图像', 'reference_count': 0}

        ref_fp = fingerprint.build_reference_fingerprint(reference_images)
        calibration_factor = fingerprint.get_calibration_factor()
        test_image = load_image(test_path)
        test_blocks = fingerprint.extract_test_prnu(test_image)

        score, confidence, conclusion = PRNUSimilarity.compute_match_score(ref_fp, test_blocks, calibration_factor)

        return {
            'score': float(score),
            'confidence': float(confidence),
            'conclusion': conclusion,
            'reference_count': len(reference_images)
        }

    except Exception as e:
        return {'score': 50.0, 'confidence': 0.0, 'conclusion': f'处理失败：{str(e)}', 'reference_count': 0}