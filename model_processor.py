import xarray as xr


FILE ='/home/riamudhole/comp-phy/SIH/backend_backup/RSMC_hycom_20260824.nc'


class HYCOMModel:
    def __init__(self, filepath=FILE):
        self.ds = xr.open_dataset(filepath)

    def metadata(self):
        """Return basic information about the HYCOM dataset."""
        return {
            "variables": list(self.ds.data_vars),
            "times": self.ds["TIME"].values,
            "depths": self.ds["DEPTH"].values,
            "latitude_range": [
                float(self.ds["LAT"].min()),
                float(self.ds["LAT"].max()),
            ],
            "longitude_range": [
                float(self.ds["LON"].min()),
                float(self.ds["LON"].max()),
            ],
        }

    def get_temperature(self, time_index=0, depth=0):
        """Return a temperature field for one time and physical depth."""

        temperature = self.ds["TEMP"].sel(
            TIME=self.ds["TIME"].isel(TIME=time_index),
            DEPTH=depth
        )

        return temperature

    def get_salinity(self, time_index=0, depth=0):
        """Return a salinity field for one time and physical depth."""

        salinity = self.ds["SALN"].sel(
            TIME=self.ds["TIME"].isel(TIME=time_index),
            DEPTH=depth
        )

        return salinity

    def get_currents(self, time_index=0, depth=0):
        """Return current fields for one time and physical depth."""

        time = self.ds["TIME"].isel(TIME=time_index)

        u = self.ds["UVEL"].sel(
            TIME=time,
            DEPTH=depth
        )

        v = self.ds["VVEL"].sel(
            TIME=time,
            DEPTH=depth
        )

        return u, v
    def get_temperature_region(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return a spatially subsetted and downsampled temperature field."""

        temperature = self.ds["TEMP"].sel(
            TIME=self.ds["TIME"].isel(TIME=time_index),
            DEPTH=depth,
            LAT=slice(lat_min, lat_max),
            LON=slice(lon_min, lon_max)
        )

        temperature = temperature.isel(
            LAT=slice(None, None, stride),
            LON=slice(None, None, stride)
        )

        return temperature
    def temperature_to_dict(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return a temperature region in JSON-friendly format."""

        temperature = self.get_temperature_region(
            time_index=time_index,
            depth=depth,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            stride=stride
        )

        return {
            "variable": "temperature",
            "time": str(temperature["TIME"].values),
            "depth": float(temperature["DEPTH"].values),
            "latitude": temperature["LAT"].values.tolist(),
            "longitude": temperature["LON"].values.tolist(),
            "values": temperature.values.tolist()
        }

    def close(self):
        """Close the underlying NetCDF file."""
        self.ds.close()

