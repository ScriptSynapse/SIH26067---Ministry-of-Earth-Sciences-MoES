from backend.model_processor import HYCOMModel


def main():
    model = HYCOMModel()

    data = model.temperature_to_dict(
        time_index=0,
        depth=50,
        lat_min=-10,
        lat_max=25,
        lon_min=40,
        lon_max=100,
        stride=5
    )

    print("Variable:", data["variable"])
    print("Time:", data["time"])
    print("Depth:", data["depth"])

    print("\nNumber of latitudes:", len(data["latitude"]))
    print("Number of longitudes:", len(data["longitude"]))

    print("\nFirst 5 latitudes:")
    print(data["latitude"][:5])

    print("\nFirst 5 longitudes:")
    print(data["longitude"][:5])

    print("\nFirst row of temperature values:")
    print(data["values"][0][:10])

    model.close()


if __name__ == "__main__":
    main()
