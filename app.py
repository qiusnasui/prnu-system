"""
PRNU 设备指纹溯源系统 - Flask 后端服务
"""

import os
import uuid
import numpy as np
from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from pathlib import Path
from flask_cors import CORS

from core.prnu_algorithm import (
    PRNUFingerprint,
    PRNUSimilarity,
    load_image,
    compute_fingerprint_similarity
)

app = Flask(__name__)
CORS(app)

# 配置
BASE_DIR = Path(__file__).parent
UPLOAD_FOLDER = BASE_DIR / 'uploads'
REFERENCE_FOLDER = UPLOAD_FOLDER / 'reference'
TEST_FOLDER = UPLOAD_FOLDER / 'test'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['REFERENCE_FOLDER'] = str(REFERENCE_FOLDER)
app.config['TEST_FOLDER'] = str(TEST_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# 确保目录存在
for folder in [UPLOAD_FOLDER, REFERENCE_FOLDER, TEST_FOLDER]:
    folder.mkdir(parents=True, exist_ok=True)

# 全局存储参考指纹
reference_fingerprint_store = {
    'fingerprint': None,
    'image_paths': [],
    'count': 0
}

# 全局存储待测图像
test_images_store = {
    'images': {}  # {file_id: {'path': path, 'preview': base64_preview}}
}


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def generate_unique_filename(filename):
    """生成唯一文件名"""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'jpg'
    return f"{uuid.uuid4().hex[:12]}.{ext}"


@app.route('/')
def index():
    """首页"""
    return render_template('index.html')


@app.route('/static/<path:filename>')
def serve_static(filename):
    """提供静态文件"""
    return send_from_directory(BASE_DIR / 'static', filename)


@app.route('/api/upload-reference', methods=['POST'])
def upload_reference():
    """上传参考图像"""
    if 'files' not in request.files:
        return jsonify({'error': '没有找到上传文件'}), 400

    files = request.files.getlist('files')

    if not files:
        return jsonify({'error': '没有选择文件'}), 400

    uploaded_paths = []

    for file in files:
        if file and allowed_file(file.filename):
            filename = generate_unique_filename(file.filename)
            filepath = REFERENCE_FOLDER / filename
            file.save(str(filepath))
            uploaded_paths.append(str(filepath))
        else:
            return jsonify({'error': f'不支持的文件格式：{file.filename}'}), 400

    if not uploaded_paths:
        return jsonify({'error': '没有成功上传任何文件'}), 400

    try:
        images = [load_image(p) for p in uploaded_paths]

        fingerprint = PRNUFingerprint()
        ref_fp = fingerprint.build_reference_fingerprint(images)

        # 重置参考指纹（不累加，每次上传都是新的参考集）
        reference_fingerprint_store['fingerprint'] = ref_fp
        reference_fingerprint_store['image_paths'] = uploaded_paths
        reference_fingerprint_store['count'] = len(images)

        shape_list = [int(dim) for dim in ref_fp.shape]

        return jsonify({
            'success': True,
            'message': f'成功上传 {len(uploaded_paths)} 张参考图像',
            'total_reference_images': int(reference_fingerprint_store['count']),
            'fingerprint_shape': shape_list
        })

    except Exception as e:
        for p in uploaded_paths:
            try:
                os.remove(p)
            except:
                pass
        return jsonify({'error': f'处理图像失败：{str(e)}'}), 500


@app.route('/api/upload-test', methods=['POST'])
def upload_test():
    """上传待测图像"""
    if 'files' not in request.files and 'file' not in request.files:
        return jsonify({'error': '没有找到上传文件'}), 400

    files = request.files.getlist('files') if 'files' in request.files else [request.files['file']]

    uploaded_paths = []
    file_ids = []

    for file in files:
        if file and allowed_file(file.filename):
            filename = generate_unique_filename(file.filename)
            filepath = TEST_FOLDER / filename
            file.save(str(filepath))
            uploaded_paths.append(str(filepath))
            file_ids.append(filename)
        else:
            return jsonify({'error': f'不支持的文件格式：{file.filename}'}), 400

    if not uploaded_paths:
        return jsonify({'error': '没有成功上传任何文件'}), 400

    # 保存到存储
    for file_id, path in zip(file_ids, uploaded_paths):
        test_images_store['images'][file_id] = {'path': path}

    return jsonify({
        'success': True,
        'message': f'成功上传 {len(uploaded_paths)} 张待测图像',
        'files': [{'file_id': fid, 'file_path': path} for fid, path in zip(file_ids, uploaded_paths)]
    })


@app.route('/api/compare', methods=['POST'])
def compare():
    """执行 PRNU 比对（单张）"""
    if reference_fingerprint_store['fingerprint'] is None:
        return jsonify({'error': '请先上传参考图像'}), 400

    data = request.get_json() or {}
    file_path = data.get('file_path')
    file_id = data.get('file_id')

    if not file_path and not file_id:
        return jsonify({'error': '请指定待测图像'}), 400

    if not file_path and file_id:
        file_path = str(TEST_FOLDER / file_id)

    if not os.path.exists(file_path):
        return jsonify({'error': '待测图像文件不存在'}), 404

    try:
        test_image = load_image(file_path)

        fingerprint = PRNUFingerprint()
        test_prnu = fingerprint.extract_test_prnu(test_image)

        ref_fp = reference_fingerprint_store['fingerprint']
        score, confidence, conclusion = PRNUSimilarity.compute_match_score(ref_fp, test_prnu)

        # 计算相似位置信息
        similarity_details = PRNUSimilarity.get_similarity_details(ref_fp, test_prnu)

        result = {
            'success': True,
            'score': float(round(score, 2)),
            'confidence': float(round(confidence, 4)),
            'conclusion': str(conclusion),
            'reference_count': int(reference_fingerprint_store['count']),
            'analysis': {
                'score_category': get_score_category(score),
                'confidence_level': get_confidence_level(confidence),
                'recommendation': get_recommendation(score, confidence)
            },
            'similarity_details': similarity_details
        }

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': f'比对失败：{str(e)}'}), 500


@app.route('/api/compare-batch', methods=['POST'])
def compare_batch():
    """批量执行 PRNU 比对"""
    if reference_fingerprint_store['fingerprint'] is None:
        return jsonify({'error': '请先上传参考图像'}), 400

    data = request.get_json() or {}
    file_ids = data.get('file_ids', [])
    file_paths = data.get('file_paths', [])

    if not file_ids and not file_paths:
        return jsonify({'error': '请指定待测图像'}), 400

    results = []
    ref_fp = reference_fingerprint_store['fingerprint']
    fingerprint = PRNUFingerprint()

    # 处理 file_ids
    for file_id in file_ids:
        file_path = str(TEST_FOLDER / file_id)
        if not os.path.exists(file_path):
            continue
        try:
            test_image = load_image(file_path)
            test_prnu = fingerprint.extract_test_prnu(test_image)
            score, confidence, conclusion = PRNUSimilarity.compute_match_score(ref_fp, test_prnu)
            similarity_details = PRNUSimilarity.get_similarity_details(ref_fp, test_prnu)

            results.append({
                'file_id': file_id,
                'file_path': file_path,
                'success': True,
                'score': float(round(score, 2)),
                'confidence': float(round(confidence, 4)),
                'conclusion': str(conclusion),
                'reference_count': int(reference_fingerprint_store['count']),
                'analysis': {
                    'score_category': get_score_category(score),
                    'confidence_level': get_confidence_level(confidence),
                    'recommendation': get_recommendation(score, confidence)
                },
                'similarity_details': similarity_details
            })
        except Exception as e:
            results.append({
                'file_id': file_id,
                'success': False,
                'error': str(e)
            })

    # 处理 file_paths
    for file_path in file_paths:
        if not os.path.exists(file_path):
            continue
        try:
            test_image = load_image(file_path)
            test_prnu = fingerprint.extract_test_prnu(test_image)
            score, confidence, conclusion = PRNUSimilarity.compute_match_score(ref_fp, test_prnu)
            similarity_details = PRNUSimilarity.get_similarity_details(ref_fp, test_prnu)

            results.append({
                'file_path': file_path,
                'success': True,
                'score': float(round(score, 2)),
                'confidence': float(round(confidence, 4)),
                'conclusion': str(conclusion),
                'analysis': {
                    'score_category': str(get_score_category(score)),
                    'confidence_level': str(get_confidence_level(confidence)),
                    'recommendation': str(get_recommendation(score, confidence))
                },
                'similarity_details': similarity_details
            })
        except Exception as e:
            results.append({
                'file_path': file_path,
                'success': False,
                'error': str(e)
            })

    return jsonify({
        'success': True,
        'total': len(results),
        'results': results
    })


@app.route('/api/reset', methods=['POST'])
def reset():
    """重置系统"""
    reference_fingerprint_store['fingerprint'] = None
    reference_fingerprint_store['image_paths'] = []
    reference_fingerprint_store['count'] = 0

    # 清除待测图像
    for file_id, info in test_images_store['images'].items():
        try:
            if os.path.exists(info['path']):
                os.remove(info['path'])
        except:
            pass
    test_images_store['images'] = {}

    for folder in [REFERENCE_FOLDER, TEST_FOLDER]:
        for f in folder.glob('*'):
            try:
                f.unlink()
            except:
                pass

    return jsonify({'success': True, 'message': '已重置系统'})


@app.route('/api/status', methods=['GET'])
def status():
    """获取系统状态"""
    shape_value = None
    if reference_fingerprint_store['fingerprint'] is not None:
        shape_value = [int(dim) for dim in reference_fingerprint_store['fingerprint'].shape]

    return jsonify({
        'has_reference': reference_fingerprint_store['fingerprint'] is not None,
        'reference_count': int(reference_fingerprint_store['count']),
        'fingerprint_shape': shape_value,
        'test_images_count': len(test_images_store['images'])
    })


@app.route('/api/test-images', methods=['GET'])
def get_test_images():
    """获取待测图像列表"""
    images = []
    for file_id, info in test_images_store['images'].items():
        images.append({
            'file_id': file_id,
            'file_path': info['path']
        })
    return jsonify({'success': True, 'images': images})


@app.route('/api/test-images/<file_id>', methods=['DELETE'])
def delete_test_image(file_id):
    """删除指定待测图像"""
    if file_id in test_images_store['images']:
        info = test_images_store['images'][file_id]
        try:
            if os.path.exists(info['path']):
                os.remove(info['path'])
        except:
            pass
        del test_images_store['images'][file_id]
        return jsonify({'success': True, 'message': f'已删除 {file_id}'})
    return jsonify({'error': '文件不存在'}), 404


@app.route('/api/test-images/<file_id>', methods=['GET'])
def get_test_image(file_id):
    """获取指定待测图像文件"""
    if file_id in test_images_store['images']:
        info = test_images_store['images'][file_id]
        if os.path.exists(info['path']):
            return send_file(info['path'])
    return jsonify({'error': '文件不存在'}), 404


def get_score_category(score):
    if score >= 80:
        return 'excellent'
    elif score >= 65:
        return 'good'
    elif score >= 45:
        return 'fair'
    elif score >= 25:
        return 'poor'
    else:
        return 'very_poor'


def get_confidence_level(confidence):
    if confidence >= 0.8:
        return 'high'
    elif confidence >= 0.5:
        return 'medium'
    else:
        return 'low'


def get_recommendation(score, confidence):
    if confidence < 0.3:
        return "建议上传更多参考图像或更高分辨率的待测图像以提高置信度"
    elif score >= 80:
        return "可以高度确信图像来源于参考设备"
    elif score >= 65:
        return "图像很可能来源于参考设备，建议结合其他证据综合判断"
    elif score >= 45:
        return "无法确定图像来源，建议收集更多参考图像"
    else:
        return "图像很可能不来源于参考设备"


if __name__ == '__main__':
    print("=" * 50)
    print("PRNU 设备指纹溯源系统")
    print("=" * 50)
    app.run(debug=True, host='0.0.0.0', port=5000)