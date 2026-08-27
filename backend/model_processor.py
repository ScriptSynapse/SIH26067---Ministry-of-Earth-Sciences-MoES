import xarray as xr
import numpy as np

FILE = "/Users/manavgharat/SIH/SIH26067---Ministry-of-Earth-Sciences-MoES/backend/RSMC_Hycom_Data_Aug_25_2026.nc"


class HYCOMModel:
    def __init__(self, filepath=FILE):
        self.ds = xr.open_dataset(filepath)

    @staticmethod
    def clean_values(values):
        # Convert the xarray/numpy data to a NumPy array
        array = np.asarray(values, dtype=float)

        # Convert every value:
        #
        #     NaN / infinity -> None
        #     normal number  -> float
        cleaned = [
            [
                None if not np.isfinite(value) else float(value)
                for value in row
            ]
            for row in array
        ]

        return cleaned

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

        # Remove invalid HYCOM values
        temperature = temperature.where(temperature > -1e30)

        return temperature

    def get_salinity_region(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return a spatially subsetted and downsampled salinity field."""

        salinity = self.ds["SALN"].sel(
            TIME=self.ds["TIME"].isel(TIME=time_index),
            DEPTH=depth,
            LAT=slice(lat_min, lat_max),
            LON=slice(lon_min, lon_max)
        )

        salinity = salinity.isel(
            LAT=slice(None, None, stride),
            LON=slice(None, None, stride)
        )

        salinity = salinity.where(salinity > -1e30)

        return salinity

    def get_currents_region(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return a spatially subsetted and downsampled current field."""

        time = self.ds["TIME"].isel(TIME=time_index)

        u = self.ds["UVEL"].sel(
            TIME=time,
            DEPTH=depth,
            LAT=slice(lat_min, lat_max),
            LON=slice(lon_min, lon_max)
        )

        v = self.ds["VVEL"].sel(
            TIME=time,
            DEPTH=depth,
            LAT=slice(lat_min, lat_max),
            LON=slice(lon_min, lon_max)
        )

        u = u.isel(
            LAT=slice(None, None, stride),
            LON=slice(None, None, stride)
        )

        v = v.isel(
            LAT=slice(None, None, stride),
            LON=slice(None, None, stride)
        )

        u = u.where(u > -1e30)
        v = v.where(v > -1e30)

        return u, v

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
        """Return temperature data in JSON-friendly format."""

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
            "values": self.clean_values(temperature.values)
        }

    def salinity_to_dict(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return salinity data in JSON-friendly format."""

        salinity = self.get_salinity_region(
            time_index=time_index,
            depth=depth,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            stride=stride
        )

        return {
            "variable": "salinity",
            "time": str(salinity["TIME"].values),
            "depth": float(salinity["DEPTH"].values),
            "latitude": salinity["LAT"].values.tolist(),
            "longitude": salinity["LON"].values.tolist(),
            "values": self.clean_values(salinity.values)
        }

    def currents_to_dict(
        self,
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    ):
        """Return current vectors in JSON-friendly format."""

        u, v = self.get_currents_region(
            time_index=time_index,
            depth=depth,
            lat_min=lat_min,
            lat_max=lat_max,
            lon_min=lon_min,
            lon_max=lon_max,
            stride=stride
        )

        return {
            "variable": "currents",
            "time": str(u["TIME"].values),
            "depth": float(u["DEPTH"].values),
            "latitude": u["LAT"].values.tolist(),
            "longitude": u["LON"].values.tolist(),
            "u": self.clean_values(u.values),
            "v": self.clean_values(u.values)
        }

    def close(self):
        """Close the underlying NetCDF file."""

        self.ds.close()
