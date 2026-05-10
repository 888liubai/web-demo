from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import onnxruntime as ort
import numpy as np
from PIL import Image
import io
import os
import cv2
import tempfile
import time

app = FastAPI(title="水稻病虫害识别系统")

# 修复1：完善 CORS 配置，确保前端能调通
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路径配置
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 假设前端文件放在 ./frontend 目录下
FRONTEND_PATH = os.path.join(BASE_DIR, "frontend")
MODEL_PATH = os.path.join(BASE_DIR, "model", "best.onnx")

# 加载模型
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"❌ 模型文件不存在：{MODEL_PATH}")
ort_session = ort.InferenceSession(MODEL_PATH)
print(f"✅ 模型加载成功：{MODEL_PATH}")

# 类别映射（严格对应你的 data.yaml）
CLASS_NAMES = [
    "细菌性叶枯病",
    "褐斑病",
    "健康叶片",
    "叶瘟病",
    "叶灼病",
    "窄褐斑病",
    "穗颈瘟",
    "稻铁甲虫"
]

def preprocess_image(image: Image.Image):
    """预处理图片：调整大小、归一化、转张量"""
    input_size = (800, 800)
    image = image.resize(input_size)
    image_np = np.array(image).astype(np.float32) / 255.0
    # HWC -> CHW
    image_np = image_np.transpose(2, 0, 1)
    image_np = np.expand_dims(image_np, axis=0)
    return image_np

def postprocess_output(output_data, conf_threshold=0.25):
    """后处理 YOLO 输出，返回结构化结果"""
    predictions = output_data[0]
    results = []

    for pred in predictions:
        # pred format: [x, y, w, h, conf, class0, class1, ...]
        confidence = float(pred[4])
        if confidence < conf_threshold:
            continue

        class_id = int(pred[5])
        class_name = CLASS_NAMES[class_id] if class_id < len(CLASS_NAMES) else "未知"

        results.append({
            "class_id": class_id,
            "class_name": class_name,
            "confidence": round(confidence * 100, 2)
        })

    # 按置信度排序，取最高的一个
    if results:
        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[0] # 返回置信度最高的结果
    return None

# ========== 接口定义 ==========

@app.post("/predict", summary="图片识别接口")
async def predict(file: UploadFile = File(...)):
    try:
        # 1. 读取图片
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # 2. 预处理
        image_np = preprocess_image(image)

        # 3. 模型推理
        input_name = ort_session.get_inputs()[0].name
        outputs = ort_session.run(None, {input_name: image_np})

        # 4. 后处理（修复2：结构化返回，方便前端解析）
        result = postprocess_output(outputs)

        if result:
            return JSONResponse(content={
                "status": "success",
                "data": {
                    "disease_name": result["class_name"],
                    "confidence": f"{result['confidence']}%",
                    "suggestion": generate_suggestion(result["class_name"])
                },
                "message": "识别成功"
            })
        else:
            return JSONResponse(content={
                "status": "success",
                "data": {
                    "disease_name": "未检测到明显病虫害",
                    "confidence": "-",
                    "suggestion": "植株看起来较为健康，建议持续观察。"
                },
                "message": "识别完成"
            })

    except Exception as e:
        print(f"❌ 识别错误: {str(e)}")
        return JSONResponse(status_code=500, content={
            "status": "error",
            "message": f"识别失败: {str(e)}"
        })

def generate_suggestion(disease_name):
    """根据病害名生成建议"""
    suggestions = {
        "叶瘟病": "建议使用 20% 三环唑可湿性粉剂 1000 倍液喷雾，间隔 7 天再喷一次。",
        "穗颈瘟": "在破口期和齐穗期各喷施一次 75% 三环唑可湿性粉剂。",
        "褐斑病": "注意田间通风，降低湿度，可用 50% 多菌灵可湿性粉剂 800 倍液防治。",
        "细菌性叶枯病": "选用抗病品种，避免偏施氮肥，发病初期用噻唑锌防治。",
        "稻铁甲虫": "使用 20% 氯虫苯甲酰胺悬浮剂，或采用人工捕杀成虫。"
    }
    return suggestions.get(disease_name, "建议咨询当地农业技术人员进行针对性防治。")

# ========== 静态文件托管（前端页面） ==========
if os.path.exists(FRONTEND_PATH):
    # 挂载静态资源
    app.mount("/static", StaticFiles(directory=FRONTEND_PATH), name="static")

    # 首页路由
    @app.get("/")
    def read_index():
        index_path = os.path.join(FRONTEND_PATH, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"message": "前端页面未找到，请确保 frontend 目录存在"}

if __name__ == "__main__":
    import uvicorn
    print("🚀 启动服务中...")
    uvicorn.run(app, host="0.0.0.0", port=8000)