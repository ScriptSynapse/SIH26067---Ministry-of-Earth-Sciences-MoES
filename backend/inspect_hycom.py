"""//6 depth levels and 28 time steps at 6-hour intervals."""
import xarray as xr

FILE ="/home/riamudhole/comp-phy/SIH/backend/RSMC_hycom_20260824.nc"
def main():
    ds = xr.open_dataset(FILE)

    print("Temperature:")
    print(ds["TEMP"])

    print("\nTemperature attributes:")
    print(ds["TEMP"].attrs)

    print("\nTemperature encoding:")
    print(ds["TEMP"].encoding)

    print("\nSalinity attributes:")
    print(ds["SALN"].attrs)

    print("\nCoordinates:")
    print("LAT:", ds["LAT"].values[:5])
    print("LON:", ds["LON"].values[:5])
    print("DEPTH:", ds["DEPTH"].values)
    print("TIME:", ds["TIME"].values)

    ds.close()


if __name__ == "__main__":
    main()
