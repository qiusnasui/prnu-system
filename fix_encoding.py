# 修复 HTML 文件编码
import shutil

# 复制原始文件
shutil.copy(r'D:\prnu-system\templates\index.html', r'D:\prnu-system\templates\index_orig.html')

# 读取并修复
with open(r'D:\prnu-system\templates\index.html', 'rb') as f:
    raw = f.read()

# ISO-8859-1 编码读取，UTF-8 写回
text = raw.decode('iso-8859-1')

# 写回 UTF-8
with open(r'D:\prnu-system\templates\index.html', 'wb') as f:
    f.write(text.encode('utf-8'))

print("Fixed encoding")
