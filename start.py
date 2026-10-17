import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv("apikey.env")

client = OpenAI(
    base_url="https://api.tokenfactory.nebius.com/v1/",
    api_key=os.environ["NEBIUS_API_KEY"],
)

r = client.chat.completions.create(
    model="Qwen/Qwen3-235B-A22B-Instruct-2507",
    messages=[{"role": "user", "content": "hello"}],
)
print(r.choices[0].message.content)
