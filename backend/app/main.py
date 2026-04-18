from fastapi import FastAPI

app = FastAPI(title="Dniche LEED AI Backend")


@app.get("/")
def read_root():
    return {"message": "Backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}
