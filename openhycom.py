import xarray as xr
ds = xr.open_dataset('RSMC_hycom_20260824.nc')
print(ds)
