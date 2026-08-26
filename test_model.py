from model_processor import HYCOMModel


def main():
    model = HYCOMModel()

    print("=" * 60)
    print("HYCOM MODEL TEST")
    print("=" * 60)

    # ---------------------------------------------------------
    # 1. DATASET METADATA
    # ---------------------------------------------------------

    metadata = model.metadata()

    print("\nDATASET METADATA")
    print("-" * 60)

    print("Variables:")
    print(metadata["variables"])

    print("\nDepths:")
    print(metadata["depths"])

    print("\nLatitude range:")
    print(metadata["latitude_range"])

    print("\nLongitude range:")
    print(metadata["longitude_range"])

    print("\nNumber of time steps:")
    print(len(metadata["times"]))

    # ---------------------------------------------------------
    # 2. TEMPERATURE
    # ---------------------------------------------------------

    print("\n" + "=" * 60)
    print("TEMPERATURE TEST")
    print("=" * 60)

    temperature = model.temperature_to_dict(
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    )

    print("Variable:", temperature["variable"])
    print("Time:", temperature["time"])
    print("Depth:", temperature["depth"])

    print("Number of latitudes:", len(temperature["latitude"]))
    print("Number of longitudes:", len(temperature["longitude"]))

    print("First 5 latitudes:")
    print(temperature["latitude"][:5])

    print("First 5 longitudes:")
    print(temperature["longitude"][:5])

    print("First 5 temperature values:")
    print(temperature["values"][0][:5])

    # ---------------------------------------------------------
    # 3. SALINITY
    # ---------------------------------------------------------

    print("\n" + "=" * 60)
    print("SALINITY TEST")
    print("=" * 60)

    salinity = model.salinity_to_dict(
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    )

    print("Variable:", salinity["variable"])
    print("Time:", salinity["time"])
    print("Depth:", salinity["depth"])

    print("Number of latitudes:", len(salinity["latitude"]))
    print("Number of longitudes:", len(salinity["longitude"]))

    print("First 5 salinity values:")
    print(salinity["values"][0][:5])

    # ---------------------------------------------------------
    # 4. CURRENTS
    # ---------------------------------------------------------

    print("\n" + "=" * 60)
    print("CURRENT TEST")
    print("=" * 60)

    currents = model.currents_to_dict(
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    )

    print("Variable:", currents["variable"])
    print("Time:", currents["time"])
    print("Depth:", currents["depth"])
    print("Number of latitudes:", len(currents["latitude"]))
    print("Number of longitudes:", len(currents["longitude"]))
    print("First 5 U values:")
    print(currents["u"][0][:5])
    print("First 5 V values:")
    print(currents["v"][0][:5])
    model.close()
    print("\n" + "=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
