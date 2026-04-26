/**
 * PRNU 设备指纹溯源系统 - 封面轮播逻辑
 */

let currentSlide = 0;
const totalSlides = 5;
let slideInterval;

// 初始化轮播
document.addEventListener('DOMContentLoaded', function() {
    startSlideshow();
    initIndicators();
});

// 开始轮播
function startSlideshow() {
    slideInterval = setInterval(() => {
        currentSlide = (currentSlide + 1) % totalSlides;
        showSlide(currentSlide);
    }, 5000); // 每 5 秒切换一张
}

// 停止轮播
function stopSlideshow() {
    if (slideInterval) {
        clearInterval(slideInterval);
    }
}

// 显示指定幻灯片
function showSlide(index) {
    const slides = document.querySelectorAll('.slide');
    const indicators = document.querySelectorAll('.indicator');

    // 移除所有 active 类
    slides.forEach(slide => slide.classList.remove('active'));
    indicators.forEach(indicator => indicator.classList.remove('active'));

    // 添加 active 类到当前幻灯片
    if (slides[index]) {
        slides[index].classList.add('active');
    }
    if (indicators[index]) {
        indicators[index].classList.add('active');
    }
}

// 初始化指示器
function initIndicators() {
    const indicators = document.querySelectorAll('.indicator');
    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            currentSlide = index;
            showSlide(currentSlide);
            // 重置计时器
            stopSlideshow();
            startSlideshow();
        });
    });
}

// 进入系统
function enterSystem() {
    // 停止轮播
    stopSlideshow();

    const coverPage = document.getElementById('coverPage');
    const mainSystem = document.getElementById('mainSystem');

    // 添加淡出动画
    coverPage.classList.add('cover-fade-out');

    // 等待动画完成后隐藏封面，显示主系统
    setTimeout(() => {
        coverPage.style.display = 'none';
        mainSystem.style.display = 'block';
        mainSystem.classList.add('main-fade-in');

        // 检查系统状态
        checkStatus();
    }, 800);
}

// 检查系统状态
async function checkStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        document.getElementById('refCount').textContent = status.reference_count;

        const statusEl = document.getElementById('systemStatus');
        if (status.has_reference) {
            statusEl.textContent = '已加载参考指纹';
            statusEl.className = 'status-ready';
        } else {
            statusEl.textContent = '就绪';
            statusEl.className = 'status-ready';
        }
    } catch (error) {
        console.error('检查状态失败:', error);
    }
}

// 显示特性详情
function showFeatureDetail(title, desc, element) {
    const modal = document.getElementById('featureModal');
    const modalTitle = document.getElementById('featureModalTitle');
    const modalDesc = document.getElementById('featureModalDesc');

    modalTitle.textContent = title;
    modalDesc.textContent = desc;
    modal.style.display = 'flex';

    // 添加动画
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

// 关闭特性详情
function closeFeatureDetail() {
    const modal = document.getElementById('featureModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

// 切换统计详情展开状态
function toggleStatDetail(element) {
    const isExpanded = element.classList.contains('expanded');

    // 关闭其他展开的项
    document.querySelectorAll('.stat-item').forEach(item => {
        item.classList.remove('expanded');
    });

    // 如果之前没有展开，则展开当前项
    if (!isExpanded) {
        element.classList.add('expanded');
    }
}
