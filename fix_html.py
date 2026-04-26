import re

# 读取文件
with open(r'D:\prnu-system\templates\index.html', 'rb') as f:
    content = f.read()

# 尝试不同编码
for encoding in ['utf-8', 'gbk', 'latin-1', 'cp1252']:
    try:
        text = content.decode(encoding)
        print(f"Success with encoding: {encoding}")
        break
    except:
        continue
else:
    text = content.decode('utf-8', errors='ignore')

# 替换 upload-actions 部分
old_pattern = r'<div class="upload-actions">.*?<button class="btn-primary" id="uploadTestBtn" onclick="uploadTest\(\)">(.*?)</button>.*?<button class="btn-compare-batch".*?</button>.*?</div>'
new_str = r'<button class="btn-primary" id="uploadTestBtn" onclick="uploadTest()">\1</button>'
text = re.sub(old_pattern, new_str, text, flags=re.DOTALL)

# 写回文件
with open(r'D:\prnu-system\templates\index.html', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done - replaced upload-actions")
