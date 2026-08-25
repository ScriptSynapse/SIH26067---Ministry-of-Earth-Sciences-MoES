## created on 25/08/2026 by Manav Gharat
## I tried my best to add comments TwT

from fastapi import FastAPI
from model_processor import HYCOMModel
app = FastAPI( title = "Ocean Data API", description = "API For Ocean Data Visualization Platform", version = "1.0.0" )

@app.get("/")
def root():
    return {"message": "Ocean Data API is working"}

@app.get("/health") #just for status
def health_check():
    return {"status": "ok"}

@app.get("/metadata")
def metadata():
    model = HYCOMModel() ## opening the HYCOM NetCDF file
    metadata = model.metadata() ##calling the method
    return{
        "variables": metadata["variables"],
        "times": [str(time) for time in metadata["times"]],  ## Converted them cuz xarray values won't fly, we need JSON
        "depths": [float(depth) for depth in metadata["depths"]], ##same as the one above
        "latitude_range": metadata["latitude_range"],
        "longitude_range": metadata["longitude_range"],
    }