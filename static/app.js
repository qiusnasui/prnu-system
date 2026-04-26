let referenceFiles = [];
let testFiles = [];
let uploadedTestImages = [];
let testImageBlobUrls = {};

// 阻止默认拖拽行为
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// 初始化拖拽上传
function initDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // 参考图像上传区域拖拽
    const refUploadArea = document.getElementById('referenceUploadArea');
    if (refUploadArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            refUploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (eventName === 'dragover' || eventName === 'dragenter') {
                    refUploadArea.classList.add('dragover');
                } else {
                    refUploadArea.classList.remove('dragover');
                }
            }, false);
        });

        refUploadArea.addEventListener('drop', (e) => {
            refUploadArea.classList.remove('dragover');
            const files = [...e.dataTransfer.files];
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                referenceFiles = [...referenceFiles, ...imageFiles];
                updateReferenceFileList();
                document.getElementById('refCount').innerText = referenceFiles.length;
            }
        }, false);
    }

    // 待测图像上传区域拖拽
    const testUploadArea = document.getElementById('testUploadArea');
    if (testUploadArea) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            testUploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (eventName === 'dragover' || eventName === 'dragenter') {
                    testUploadArea.classList.add('dragover');
                } else {
                    testUploadArea.classList.remove('dragover');
                }
            }, false);
        });

        testUploadArea.addEventListener('drop', (e) => {
            testUploadArea.classList.remove('dragover');
            const files = [...e.dataTransfer.files];
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (imageFiles.length > 0) {
                testFiles = [...testFiles, ...imageFiles];
                updateTestFileList();
                updateTestImageCount();
            }
        }, false);
    }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initDragAndDrop();
    // 页面加载时不检查状态，保持初始值 0
    // checkStatus();
    // 确保参考图片计数为 0
    document.getElementById('refCount').innerText = '0';
});

function updateTestImageCount() {
    const count = testFiles.length + uploadedTestImages.length;
    const countEl = document.getElementById('testImageCount');
    const countBarEl = document.getElementById('testImageCountBar');
    const batchBtn = document.getElementById('batchCompareBtn');
    const btnImageCount = document.getElementById('btnImageCount');

    if (countEl) countEl.innerText = count;
    if (countBarEl) countBarEl.innerText = count;
    if (btnImageCount) btnImageCount.innerText = count;
    if (batchBtn) batchBtn.disabled = count === 0;
}

// 参考文件选择变化
document.getElementById('referenceFiles').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files);
        referenceFiles = [...referenceFiles, ...newFiles];
        updateReferenceFileList();
        document.getElementById('refCount').innerText = referenceFiles.length;
        e.target.value = '';
    }
});

// 待测文件选择变化
document.getElementById('testFile').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files);
        testFiles = [...testFiles, ...newFiles];
        updateTestFileList();
        updateTestImageCount();
        e.target.value = '';
    }
});

function updateReferenceFileList() {
    const list = document.getElementById('referenceFileList');
    list.innerHTML = '';
    referenceFiles.forEach((f, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const img = document.createElement('img');
        img.className = 'file-preview-img';
        img.src = URL.createObjectURL(f);
        img.onclick = () => removeReferenceFile(index);

        const name = document.createElement('span');
        name.className = 'file-name';
        name.innerText = f.name;

        const remove = document.createElement('span');
        remove.className = 'file-remove';
        remove.innerHTML = '&times;';
        remove.onclick = () => removeReferenceFile(index);

        item.appendChild(img);
        item.appendChild(name);
        item.appendChild(remove);
        list.appendChild(item);
    });
}

function removeReferenceFile(index) {
    referenceFiles.splice(index, 1);
    updateReferenceFileList();
    document.getElementById('refCount').innerText = referenceFiles.length;
}

function updateTestFileList() {
    const list = document.getElementById('testFileList');
    list.innerHTML = '';
    testFiles.forEach((f, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';

        const img = document.createElement('img');
        img.className = 'file-preview-img';
        img.src = URL.createObjectURL(f);
        img.onclick = () => removeTestFile(index);

        const name = document.createElement('span');
        name.className = 'file-name';
        name.innerText = f.name;

        const remove = document.createElement('span');
        remove.className = 'file-remove';
        remove.innerHTML = '&times;';
        remove.onclick = () => removeTestFile(index);

        item.appendChild(img);
        item.appendChild(name);
        item.appendChild(remove);
        list.appendChild(item);

        // 保存 Blob URL
        testImageBlobUrls[f.name] = URL.createObjectURL(f);
    });
}

function removeTestFile(index) {
    const removedFile = testFiles[index];
    testFiles.splice(index, 1);
    if (removedFile.name in testImageBlobUrls) {
        URL.revokeObjectURL(testImageBlobUrls[removedFile.name]);
        delete testImageBlobUrls[removedFile.name];
    }
    updateTestFileList();
    updateTestImageCount();
}

// 获取显示用的文件名
function getDisplayName(fileObj) {
    if (fileObj.file_id) {
        // 服务器上传的文件，file_id 可能是 UUID，优先用 file_path 中的文件名
        if (fileObj.file_path) {
            const parts = fileObj.file_path.split(/[\\/]/);
            return parts[parts.length - 1];
        }
        return fileObj.file_id;
    }
    return fileObj.name || '未知文件';
}

async function uploadReference() {
    if (referenceFiles.length === 0) {
        alert('请选择参考图像');
        return;
    }

    showLoading("上传参考图像...");
    const fd = new FormData();
    referenceFiles.forEach((f) => {
        fd.append('files', f);
    });

    try {
        const res = await fetch('/api/upload-reference', {
            method: 'POST',
            body: fd
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'HTTP 错误：' + res.status);
        }

        if (data.success) {
            alert(data.message);
            // 直接使用后端返回的计数，不再调用 checkStatus
            document.getElementById('refCount').innerText = data.total_reference_images;
            document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span>已加载参考指纹';
            referenceFiles = [];
            updateReferenceFileList();
        } else {
            alert('上传失败：' + data.error);
        }
    } catch (e) {
        console.error('上传参考图像错误:', e);
        alert('上传失败：' + e.message);
    } finally {
        hideLoading();
    }
}

async function uploadTest() {
    if (testFiles.length === 0) {
        alert('请选择待测图像');
        return;
    }

    showLoading("上传待测图像...");
    const fd = new FormData();
    testFiles.forEach((f) => {
        fd.append('files', f);
    });

    try {
        const res = await fetch('/api/upload-test', {
            method: 'POST',
            body: fd
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'HTTP 错误：' + res.status);
        }

        if (data.success) {
            alert(data.message);
            // 保存已上传的图像信息
            uploadedTestImages = [...uploadedTestImages, ...data.files];
            // 清空本地文件列表
            testFiles = [];
            updateTestFileList();
            updateTestImageCount();
            checkStatus();
        } else {
            alert('上传失败：' + data.error);
        }
    } catch (e) {
        console.error('上传待测图像错误:', e);
        alert('上传失败：' + e.message);
    } finally {
        hideLoading();
    }
}

// 批量比对
async function compareBatch() {
    if (uploadedTestImages.length === 0) {
        alert('请先上传待测图像');
        return;
    }

    showLoading("正在批量比对...");
    try {
        const file_ids = uploadedTestImages.map(img => img.file_id);
        const res = await fetch('/api/compare-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_ids })
        });

        const data = await res.json();
        if (!data.success) {
            alert('错误：' + data.error);
            return;
        }

        // 显示批量比对结果汇总
        displayBatchResults(data.results);

        // 自动显示第一张的详细结果
        if (data.results && data.results.length > 0) {
            batchCompareResults = data.results;
            currentBatchIndex = 0;
            showSingleResult(batchCompareResults[0]);
        }

    } catch (e) {
        console.error('比对错误:', e);
        alert('比对失败：' + e.message);
    } finally {
        hideLoading();
    }
}

// 单张比对（保留原有功能）
async function compare() {
    if (uploadedTestImages.length === 0) {
        alert('请先上传待测图像');
        return;
    }

    showLoading("正在比对...");
    try {
        const res = await fetch('/api/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: uploadedTestImages[0].file_id })
        });

        const data = await res.json();
        if (!data.success) {
            alert('错误：' + data.error);
            return;
        }

        // 更新分数
        document.getElementById('scoreValue').innerText = data.score.toFixed(1);
        document.getElementById('scoreCircle').setAttribute('stroke-dasharray', `${data.score}, 100`);

        // 更新置信度
        document.getElementById('confidenceValue').innerText = (data.confidence * 100).toFixed(1) + '%';
        document.getElementById('refImageCount').innerText = data.reference_count;
        document.getElementById('conclusionText').innerText = data.conclusion;

        // 更新判定等级和置信等级
        document.getElementById('scoreCategory').innerText = getScoreCategoryText(data.analysis.score_category);
        document.getElementById('confidenceLevel').innerText = getConfidenceLevelText(data.analysis.confidence_level);
        document.getElementById('recommendationText').innerText = data.analysis.recommendation;

        // 设置分数颜色类
        const scoreDisplay = document.querySelector('.score-display');
        scoreDisplay.className = 'score-display score-' + data.analysis.score_category;

        // 更新相似位置可视化
        if (data.similarity_details) {
            updateSimilarityVisualization(data.similarity_details);
        }

        // 显示结果面板
        document.getElementById('resultPanel').style.display = 'block';

        // 平滑滚动到结果区域
        document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
        console.error('比对错误:', e);
        alert('比对失败：' + e.message);
    } finally {
        hideLoading();
    }
}

function getScoreCategoryText(category) {
    const map = {
        'excellent': '高度匹配',
        'good': '中度匹配',
        'fair': '低度匹配',
        'poor': '不太匹配',
        'very_poor': '不匹配'
    };
    return map[category] || category;
}

function getConfidenceLevelText(level) {
    const map = {
        'high': '高',
        'medium': '中',
        'low': '低'
    };
    return map[level] || level;
}

function showLoading(text) {
    document.getElementById('loadingText').innerText = text || "处理中...";
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// 检查系统状态
async function checkStatus() {
    try {
        const res = await fetch('/api/status');
        const status = await res.json();

        // 只在有参考指纹时更新计数
        if (status.has_reference) {
            document.getElementById('refCount').innerText = status.reference_count;
            document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span>已加载参考指纹';
        } else {
            document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span>就绪';
        }
        document.getElementById('testImageCountBar').innerText = status.test_images_count || 0;
    } catch (e) {
        console.error('检查状态失败:', e);
    }
}

// 加载待测图像列表
async function loadTestImages() {
    try {
        const res = await fetch('/api/test-images');
        const data = await res.json();
        if (data.success) {
            uploadedTestImages = data.images;
            updateTestImageCount();
        }
    } catch (e) {
        console.error('加载待测图像列表失败:', e);
    }
}

function resetSystem() {
    // 清空数据数组
    referenceFiles = [];
    testFiles = [];
    uploadedTestImages = [];
    testImageBlobUrls = {};
    batchCompareResults = [];
    currentBatchIndex = 0;

    // 清空文件列表显示
    document.getElementById('referenceFileList').innerHTML = '';
    document.getElementById('testFileList').innerHTML = '';
    document.getElementById('imageGrid').innerHTML = '';
    document.getElementById('resultList').innerHTML = '';

    // 重置所有计数器为 0
    document.getElementById('refCount').innerText = '0';
    document.getElementById('testImageCount').innerText = '0';
    document.getElementById('testImageCountBar').innerText = '0';
    document.getElementById('btnImageCount').innerText = '0';

    // 隐藏结果面板
    document.getElementById('resultPanel').style.display = 'none';
    document.getElementById('batchResultSummary').style.display = 'none';

    // 重置分数显示
    document.getElementById('scoreValue').innerText = '-';
    document.getElementById('scoreCircle').setAttribute('stroke-dasharray', '0, 100');
    document.getElementById('confidenceValue').innerText = '-';
    document.getElementById('refImageCount').innerText = '-';
    document.getElementById('conclusionText').innerText = '-';
    document.getElementById('scoreCategory').innerText = '-';
    document.getElementById('confidenceLevel').innerText = '-';
    document.getElementById('recommendationText').innerText = '-';

    // 重置分数颜色类
    const scoreDisplay = document.querySelector('.score-display');
    if (scoreDisplay) {
        scoreDisplay.className = 'score-display';
    }

    // 重置可视化统计
    document.getElementById('totalBlocks').innerText = '-';
    document.getElementById('highSimBlocks').innerText = '-';
    document.getElementById('avgSimilarity').innerText = '-';
    document.getElementById('maxSimilarity').innerText = '-';

    // 清空 canvas
    const canvas = document.getElementById('similarityCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // 清空图像显示
    const overlayImg = document.getElementById('testImageOverlay');
    if (overlayImg) {
        overlayImg.src = '';
        overlayImg.style.display = 'none';
    }

    // 更新系统状态
    document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span>就绪';

    // 调用后端重置 API
    fetch('/api/reset', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            console.log('系统已重置:', data.message);
            // 重置后端数据后，调用 checkStatus 同步状态
            uploadedTestImages = [];
            checkStatus();
        })
        .catch(err => {
            console.error('重置失败:', err);
        });
}

// 获取相似度颜色（更大差距的渐变：紫色 -> 蓝色 -> 青色 -> 绿色 -> 黄色 -> 橙红）
function getSimilarityColor(similarity) {
    // 使用分段颜色，让不同相似度差距更明显
    // 0-20%: 深紫色，20-40%: 蓝色，40-60%: 青色，60-80%: 黄绿色，80-100%: 橙红色
    let hue, saturation, lightness;

    if (similarity < 0.2) {
        // 深紫色 (270°)
        hue = 270;
        saturation = 100;
        lightness = 50;
    } else if (similarity < 0.4) {
        // 蓝色 (240°)
        hue = 240;
        saturation = 100;
        lightness = 50;
    } else if (similarity < 0.6) {
        // 青色 (180°)
        hue = 180;
        saturation = 100;
        lightness = 50;
    } else if (similarity < 0.8) {
        // 黄绿色 (90°)
        hue = 90;
        saturation = 100;
        lightness = 50;
    } else {
        // 橙红色 (30°)
        hue = 30;
        saturation = 100;
        lightness = 55;
    }

    return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.9)`;
}

// 绘制相似度图例（HTML 元素方式）
function drawLegend(containerId, minSim, maxSim) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // 标题
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.innerText = '相似度颜色对照';
    container.appendChild(title);

    // 渐变条容器
    const gradientBar = document.createElement('div');
    gradientBar.className = 'legend-gradient-bar';

    // 创建渐变色块（从实际最低相似度到最高相似度）
    const minPercent = (minSim * 100).toFixed(1);
    const maxPercent = (maxSim * 100).toFixed(1);
    const midPercent = ((minSim + maxSim) / 2 * 100).toFixed(1);

    const colors = [
        { color: 'hsl(270, 100%, 50%)', label: '低' },
        { color: 'hsl(240, 100%, 50%)', label: '' },
        { color: 'hsl(180, 100%, 50%)', label: '中' },
        { color: 'hsl(90, 100%, 50%)', label: '' },
        { color: 'hsl(30, 100%, 55%)', label: '高' }
    ];

    colors.forEach((c, i) => {
        const segment = document.createElement('div');
        segment.className = 'legend-segment';
        segment.style.backgroundColor = c.color;
        if (c.label) {
            segment.innerHTML = `<span class="legend-label">${c.label}</span>`;
        }
        gradientBar.appendChild(segment);
    });

    container.appendChild(gradientBar);

    // 底部标签 - 显示实际范围
    const labels = document.createElement('div');
    labels.className = 'legend-labels';
    labels.innerHTML = `
        <span>${minPercent}%</span>
        <span>${midPercent}%</span>
        <span>${maxPercent}%</span>
    `;
    container.appendChild(labels);
}

// 更新相似位置可视化
function updateSimilarityVisualization(details) {
    const gridInfo = details.grid_info;
    const similarBlocks = details.similar_blocks || [];

    // 更新统计信息
    document.getElementById('totalBlocks').innerText = details.total_blocks;
    document.getElementById('highSimBlocks').innerText = details.high_similarity_count;
    document.getElementById('avgSimilarity').innerText = (details.average_similarity * 100).toFixed(1) + '%';
    document.getElementById('maxSimilarity').innerText = (details.max_similarity * 100).toFixed(1) + '%';

    // 设置基础图像为待测图像
    const overlayImg = document.getElementById('testImageOverlay');
    const canvas = document.getElementById('similarityCanvas');

    if (testImageBlobUrls && Object.keys(testImageBlobUrls).length > 0) {
        const firstBlobUrl = Object.values(testImageBlobUrls)[0];
        overlayImg.src = firstBlobUrl;
        overlayImg.style.display = 'block';
    } else {
        overlayImg.style.display = 'none';
    }

    // 等待图像加载完成后绘制 canvas
    overlayImg.onload = function() {
        // 使用 getBoundingClientRect 获取图片实际渲染尺寸
        const rect = overlayImg.getBoundingClientRect();

        // canvas 使用与图片渲染尺寸完全一致的像素
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);

        // canvas 位置设为 0，与图片左上角对齐
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (similarBlocks.length === 0) {
            return;
        }

        // 计算缩放比例
        const scaleX = canvas.width / gridInfo.image_width;
        const scaleY = canvas.height / gridInfo.image_height;

        // 绘制相似块（根据相似度显示不同颜色）
        similarBlocks.forEach((block, index) => {
            const x = block.x * scaleX;
            const y = block.y * scaleY;
            const blockSize = gridInfo.block_size * scaleX;

            // 根据相似度计算颜色（更大差距的分段颜色）
            const similarity = block.similarity;
            ctx.fillStyle = getSimilarityColor(similarity);
            ctx.fillRect(x, y, blockSize, blockSize);

            // 绘制白色边框
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, blockSize, blockSize);

            // 为前 10 个最相似的块添加圆圈标记和序号
            if (index < 10) {
                const centerX = x + blockSize / 2;
                const centerY = y + blockSize / 2;
                const circleRadius = blockSize * 1.4;

                // 绘制金色圆圈（带 glow 效果）
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
                ctx.lineWidth = 6;
                ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;

                // 在圆圈中心绘制序号徽章
                const badgeRadius = blockSize * 0.65;

                // 绘制渐变背景
                const badgeGradient = ctx.createRadialGradient(
                    centerX - badgeRadius * 0.3,
                    centerY - badgeRadius * 0.3,
                    0,
                    centerX,
                    centerY,
                    badgeRadius
                );
                badgeGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                badgeGradient.addColorStop(0.5, 'rgba(255, 215, 0, 1)');
                badgeGradient.addColorStop(1, 'rgba(255, 140, 0, 1)');

                ctx.beginPath();
                ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2);
                ctx.fillStyle = badgeGradient;
                ctx.fill();

                // 绘制徽章边框
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 4;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // 绘制序号数字
                ctx.fillStyle = 'white';
                ctx.font = 'bold ' + (blockSize * 0.75) + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(index + 1, centerX, centerY);
                ctx.shadowBlur = 0;
            }
        });

        // 绘制图例（在图片下方）- 从实际最低相似度开始
        const minSimilarity = similarBlocks[similarBlocks.length - 1]?.similarity || 0;
        const maxSimilarity = similarBlocks[0]?.similarity || 1;
        drawLegend('similarityLegend', minSimilarity, maxSimilarity);
    };

    // 如果图像已经加载
    if (overlayImg.complete) {
        overlayImg.onload();
    }
}

// 初始化问号提示点击交互
function initTooltipInteraction() {
    const tooltips = document.querySelectorAll('.stat-tooltip');

    tooltips.forEach(tooltip => {
        tooltip.addEventListener('click', function(e) {
            e.stopPropagation();
            tooltips.forEach(t => {
                if (t !== this) {
                    t.classList.remove('active');
                }
            });
            this.classList.toggle('active');
        });
    });

    document.addEventListener('click', function() {
        tooltips.forEach(tooltip => {
            tooltip.classList.remove('active');
        });
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initDragAndDrop();
    initTooltipInteraction();
});

// 批量比对结果存储
let batchCompareResults = [];
let currentBatchIndex = 0;

// 显示单张详细结果
function showSingleResult(result) {
    if (!result || !result.success) return;

    // 更新分数
    document.getElementById('scoreValue').innerText = result.score.toFixed(1);
    document.getElementById('scoreCircle').setAttribute('stroke-dasharray', `${result.score}, 100`);

    // 更新置信度
    document.getElementById('confidenceValue').innerText = (result.confidence * 100).toFixed(1) + '%';
    document.getElementById('refImageCount').innerText = result.reference_count;
    document.getElementById('conclusionText').innerText = result.conclusion;

    // 更新判定等级和置信等级
    document.getElementById('scoreCategory').innerText = getScoreCategoryText(result.analysis.score_category);
    document.getElementById('confidenceLevel').innerText = getConfidenceLevelText(result.analysis.confidence_level);
    document.getElementById('recommendationText').innerText = result.analysis.recommendation;

    // 设置分数颜色类
    const scoreDisplay = document.querySelector('.score-display');
    scoreDisplay.className = 'score-display score-' + result.analysis.score_category;

    // 更新相似位置可视化
    if (result.similarity_details) {
        updateSimilarityVisualizationForBatch(result);
    }

    // 显示结果面板
    document.getElementById('resultPanel').style.display = 'block';
}

// 为批量比对更新相似位置可视化
function updateSimilarityVisualizationForBatch(result) {
    const details = result.similarity_details;
    const gridInfo = details.grid_info;
    const similarBlocks = details.similar_blocks || [];

    // 更新统计信息
    document.getElementById('totalBlocks').innerText = details.total_blocks;
    document.getElementById('highSimBlocks').innerText = details.high_similarity_count;
    document.getElementById('avgSimilarity').innerText = (details.average_similarity * 100).toFixed(1) + '%';
    document.getElementById('maxSimilarity').innerText = (details.max_similarity * 100).toFixed(1) + '%';

    // 设置基础图像为待测图像
    const overlayImg = document.getElementById('testImageOverlay');
    const canvas = document.getElementById('similarityCanvas');

    // 构建图像 URL
    const imageUrl = `/api/test-images/${result.file_id}`;
    overlayImg.src = imageUrl;
    overlayImg.style.display = 'block';

    // 等待图像加载完成后绘制 canvas
    overlayImg.onload = function() {
        // 使用 getBoundingClientRect 获取图片实际渲染尺寸
        const rect = overlayImg.getBoundingClientRect();

        // canvas 使用与图片渲染尺寸完全一致的像素
        canvas.width = Math.round(rect.width);
        canvas.height = Math.round(rect.height);

        // canvas 位置设为 0，与图片左上角对齐
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (similarBlocks.length === 0) {
            return;
        }

        // 计算缩放比例
        const scaleX = canvas.width / gridInfo.image_width;
        const scaleY = canvas.height / gridInfo.image_height;

        // 绘制相似块（根据相似度显示不同颜色）
        similarBlocks.forEach((block, index) => {
            const x = block.x * scaleX;
            const y = block.y * scaleY;
            const blockSize = gridInfo.block_size * scaleX;

            // 根据相似度计算颜色（更大差距的分段颜色）
            const similarity = block.similarity;
            ctx.fillStyle = getSimilarityColor(similarity);
            ctx.fillRect(x, y, blockSize, blockSize);

            // 绘制白色边框
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, blockSize, blockSize);

            // 为前 10 个最相似的块添加圆圈标记和序号
            if (index < 10) {
                const centerX = x + blockSize / 2;
                const centerY = y + blockSize / 2;
                const circleRadius = blockSize * 1.4;

                // 绘制金色圆圈（带 glow 效果）
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
                ctx.lineWidth = 6;
                ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;

                // 在圆圈中心绘制序号徽章
                const badgeRadius = blockSize * 0.65;

                // 绘制渐变背景
                const badgeGradient = ctx.createRadialGradient(
                    centerX - badgeRadius * 0.3,
                    centerY - badgeRadius * 0.3,
                    0,
                    centerX,
                    centerY,
                    badgeRadius
                );
                badgeGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                badgeGradient.addColorStop(0.5, 'rgba(255, 215, 0, 1)');
                badgeGradient.addColorStop(1, 'rgba(255, 140, 0, 1)');

                ctx.beginPath();
                ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2);
                ctx.fillStyle = badgeGradient;
                ctx.fill();

                // 绘制徽章边框
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 4;
                ctx.stroke();
                ctx.shadowBlur = 0;

                // 绘制序号数字
                ctx.fillStyle = 'white';
                ctx.font = 'bold ' + (blockSize * 0.75) + 'px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 3;
                ctx.fillText(index + 1, centerX, centerY);
                ctx.shadowBlur = 0;
            }
        });

        // 绘制图例（在图片下方）- 从实际最低相似度开始
        const minSimilarity = similarBlocks[similarBlocks.length - 1]?.similarity || 0;
        const maxSimilarity = similarBlocks[0]?.similarity || 1;
        drawLegend('similarityLegend', minSimilarity, maxSimilarity);
    };

    // 如果图像已经加载
    if (overlayImg.complete) {
        overlayImg.onload();
    }
}

// 上一张
function prevImage() {
    if (batchCompareResults.length === 0) return;

    if (currentBatchIndex > 0) {
        currentBatchIndex--;
        updateBatchNavigation();
        showSingleResult(batchCompareResults[currentBatchIndex]);

        // 滚动到结果面板
        document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 下一张
function nextImage() {
    if (batchCompareResults.length === 0) return;

    if (currentBatchIndex < batchCompareResults.length - 1) {
        currentBatchIndex++;
        updateBatchNavigation();
        showSingleResult(batchCompareResults[currentBatchIndex]);

        // 滚动到结果面板
        document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 更新批量导航显示
function updateBatchNavigation() {
    document.getElementById('currentImageIndex').innerText = currentBatchIndex + 1;
    document.getElementById('totalImages').innerText = batchCompareResults.length;

    // 更新按钮状态
    const prevBtn = document.querySelector('.batch-nav-btn:first-of-type');
    const nextBtn = document.querySelector('.batch-nav-btn:last-of-type');

    if (prevBtn) {
        prevBtn.disabled = currentBatchIndex === 0;
    }
    if (nextBtn) {
        nextBtn.disabled = currentBatchIndex >= batchCompareResults.length - 1;
    }

    // 高亮当前选中的结果卡片
    const resultItems = document.querySelectorAll('.result-item-card');
    resultItems.forEach((item, index) => {
        if (index === currentBatchIndex) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
            item.classList.remove('active');
        }
    });

    // 高亮当前选中的图片网格项
    const gridItems = document.querySelectorAll('.image-grid-item');
    gridItems.forEach((item, index) => {
        if (index === currentBatchIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// 点击结果卡片切换到对应图像
function selectBatchResult(index) {
    if (index < 0 || index >= batchCompareResults.length) return;

    currentBatchIndex = index;
    updateBatchNavigation();
    showSingleResult(batchCompareResults[currentBatchIndex]);

    // 滚动到结果面板
    document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 选择图片网格中的图片
function selectImageFromGrid(index) {
    if (index < 0 || index >= batchCompareResults.length) return;

    currentBatchIndex = index;
    updateBatchNavigation();
    showSingleResult(batchCompareResults[currentBatchIndex]);

    // 滚动到结果面板
    document.getElementById('resultPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 修改 displayBatchResults 函数以支持点击切换
function displayBatchResults(results) {
    batchCompareResults = results;
    currentBatchIndex = 0;

    const summaryDiv = document.getElementById('batchResultSummary');
    const resultList = document.getElementById('resultList');
    const imageGrid = document.getElementById('imageGrid');

    // 统计各类别数量
    let excellent = 0, good = 0, fair = 0, poor = 0;
    const categoryMap = {
        'excellent': () => excellent++,
        'good': () => good++,
        'fair': () => fair++,
        'poor': () => poor++,
        'very_poor': () => poor++
    };

    results.forEach(r => {
        if (r.success) {
            const fn = categoryMap[r.analysis.score_category];
            if (fn) fn();
        }
    });

    // 更新统计
    document.getElementById('totalCompareCount').innerText = results.length;
    document.getElementById('excellentCount').innerText = excellent;
    document.getElementById('goodCount').innerText = good;
    document.getElementById('fairCount').innerText = fair;
    document.getElementById('poorCount').innerText = poor;

    // 生成图片网格
    imageGrid.innerHTML = '';
    results.forEach((r, index) => {
        if (!r.success) return;

        const gridItem = document.createElement('div');
        gridItem.className = 'image-grid-item';
        gridItem.onclick = () => selectImageFromGrid(index);

        const scoreCategory = r.analysis.score_category;
        let scoreLabel = '不匹配';
        if (scoreCategory === 'excellent') scoreLabel = '高度匹配';
        else if (scoreCategory === 'good') scoreLabel = '中度匹配';
        else if (scoreCategory === 'fair') scoreLabel = '低度匹配';

        gridItem.innerHTML = `
            <span class="image-index">${index + 1}</span>
            <img src="/api/test-images/${r.file_id}" alt="Image ${index + 1}" />
            <span class="image-score ${scoreCategory}">${r.score.toFixed(1)}</span>
        `;

        imageGrid.appendChild(gridItem);
    });

    // 生成结果列表
    resultList.innerHTML = '';
    results.forEach((r, index) => {
        if (!r.success) return;

        const card = document.createElement('div');
        card.className = 'result-item-card';
        card.onclick = () => selectBatchResult(index);

        const scoreCategory = r.analysis.score_category;
        let badgeClass = 'poor';
        let label = '不匹配';
        if (scoreCategory === 'excellent') { badgeClass = 'excellent'; label = '高度匹配'; }
        else if (scoreCategory === 'good') { badgeClass = 'good'; label = '中度匹配'; }
        else if (scoreCategory === 'fair') { badgeClass = 'fair'; label = '低度匹配'; }

        // 获取文件名
        const fileName = r.file_id || (r.file_path ? r.file_path.split(/[\\/]/).pop() : '未知文件');

        card.innerHTML = `
            <div class="result-item-left">
                <span style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted); width: 30px;">#${index + 1}</span>
                <div class="result-item-filename">${fileName}</div>
            </div>
            <div class="result-item-score">
                <div class="score-badge ${badgeClass}">
                    <div class="score-badge-value">${r.score.toFixed(1)}</div>
                    <div class="score-badge-label">${label}</div>
                </div>
                <div class="result-item-conclusion">${r.conclusion.substring(0, 20)}...</div>
            </div>
        `;

        resultList.appendChild(card);
    });

    // 初始化导航显示
    updateBatchNavigation();

    summaryDiv.style.display = 'block';
    summaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
