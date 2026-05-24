import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class TranslateRequest(BaseModel):
    text: str


@app.post("/translate")
async def translate(req: TranslateRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=api_key)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": (
                    "Translate the following Hungarian text to British English. "
                    "Use British spelling and expressions (e.g. 'colour', 'whilst', 'quite', 'brilliant'). "
                    "Return only the translation, nothing else:\n\n" + text
                ),
            }
        ],
    )

    return {"translation": message.content[0].text}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
