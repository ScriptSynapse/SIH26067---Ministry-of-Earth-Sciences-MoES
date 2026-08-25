from model_processor import HYCOMModel


def main():
    model = HYCOMModel()

    print("Available depths:")
    print(model.ds["DEPTH"].values)

    print("\nAvailable times:")
    print(model.ds["TIME"].values)

    print("\nDataset metadata:")
    print(model.metadata())

    temperature = model.get_temperature(
        time_index=0,
        depth=50
    )

    print("\nTemperature slice:")
    print(temperature)

    print("\nTemperature dimensions:")
    print(temperature.dims)

    print("\nTemperature shape:")
    print(temperature.shape)

    model.close()


if __name__ == "__main__":
    main()
