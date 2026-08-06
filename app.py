from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Serve index.html, CSS, JavaScript, and CSV files from the static folder
app.mount("/", StaticFiles(directory="static", html=True), name="static")
