from fastapi import FastAPI
app = FastAPI( title = "Ocean Data API", description = "Test for SIH", version = "0.0.1" )

@app.get("/")
def root():
    return {"message": "The API is working"}

@app.get("/health")
def health_check():
    return {"status": "ok"}