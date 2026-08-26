## created on 25/08/2026 by Manav Gharat
## I tried my best to add comments TwT

from fastapi import FastAPI
from model_processor import HYCOMModel
app = FastAPI( title = "Ocean Data API",
               description = "API For Ocean Data Visualization Platform",
               version = "1.0.0" )

@app.get("/")
def root():
    return {"message": "Ocean Data API is working"}

@app.get("/health") #just for status
def health_check():
    return {"status": "ok"}


## Metadata
@app.get("/metadata")

def metadata():
    model = HYCOMModel() ## opening the HYCOM NetCDF file
    data = model.metadata() ##calling the method
    model.close() ## We dont want 11GB data on our RAM
    return{
        "variables": data["variables"],
        "times": [str(time) for time in data["times"]],  ## Converted them cuz xarray values won't fly, we need JSON
        "depths": [float(depth) for depth in data["depths"]], ##same as the one above
        "latitude_range": data["latitude_range"],
        "longitude_range": data["longitude_range"],
    }

## Temperature
@app.get("/temperature")
def get_temperature(
        time_index: int = 0,
        depth: float = 50,
        lat_min: float = -10,
        lat_max: float = 25,
        lon_min: float = 40,
        lon_max: float = 100,
        stride: int = 5
):
    model = HYCOMModel()

    data = model.temperature_to_dict(
        time_index=time_index,
        depth=depth,
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        stride=stride
    )

    model.close()

    return data

## Current
@app.get("/currents")
def get_currents(
        time_index: int = 0,
        depth: float = 50,
        lat_min: float = -10,
        lat_max: float = 25,
        lon_min: float = 40,
        lon_max: float = 100,
        stride: int = 5
):
    model = HYCOMModel()
    data = model.currents_to_dict(
        time_index=time_index,
        depth=depth,
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        stride=stride
    )
    model.close()
    return data

## Salinity
@app.get("/salinity")
def get_salinity(
        time_index: int = 0,
        depth: float = 50,
        lat_min: float = -10,
        lat_max: float = 25,
        lon_min: float = 40,
        lon_max: float = 100,
        stride: int = 5
):
    model = HYCOMModel()
    data = model.salinity_to_dict(
        time_index=time_index,
        depth=depth,
        lat_min=lat_min,
        lat_max=lat_max,
        lon_min=lon_min,
        lon_max=lon_max,
        stride=stride
    )
    model.close()
    return data