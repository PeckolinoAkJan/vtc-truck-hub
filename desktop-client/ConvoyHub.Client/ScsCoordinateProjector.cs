namespace ConvoyHub.Client;

public readonly record struct ProjectedCoordinate(
    double Latitude,
    double Longitude,
    string Accuracy,
    string Profile);

/// <summary>
/// Converts the SCS world placement (X/Z) into geographic coordinates used by
/// the VTC Truck Hub live map. ETS2 and ATS use separate Lambert conformal
/// conic map definitions. Raw world coordinates are still sent to the server
/// so that future game or map-mod profiles can re-project historic samples.
/// </summary>
public static class ScsCoordinateProjector
{
    private readonly record struct LambertMapDefinition(
        string Profile,
        double OriginLatitude,
        double OriginLongitude,
        double OffsetZ,
        double OffsetX,
        double FactorZ,
        double FactorX,
        double StandardParallel1,
        double StandardParallel2,
        double MinLatitude,
        double MaxLatitude,
        double MinLongitude,
        double MaxLongitude);

    private static readonly LambertMapDefinition Ets2 = new(
        "ets2-base-lambert-v1",
        50d, 15d,
        16660d, 4150d,
        -1.71570875e-4, 1.729241463e-4,
        37d, 65d,
        28d, 72d, -30d, 65d);

    private static readonly LambertMapDefinition Ats = new(
        "ats-base-lambert-v1",
        39d, -96d,
        0d, 0d,
        -1.7706234e-4, 1.76689948e-4,
        33d, 45d,
        18d, 72d, -175d, -52d);

    public static bool TryProject(string? game, double x, double z, out ProjectedCoordinate coordinate)
    {
        coordinate = default;
        if (!double.IsFinite(x) || !double.IsFinite(z)) return false;

        var definition = string.Equals(game, "ATS", StringComparison.OrdinalIgnoreCase) ? Ats : Ets2;
        if (!TryInverseLambert(definition, x, z, out var latitude, out var longitude)) return false;

        if (latitude < definition.MinLatitude || latitude > definition.MaxLatitude
            || longitude < definition.MinLongitude || longitude > definition.MaxLongitude)
            return false;

        coordinate = new ProjectedCoordinate(
            latitude,
            longitude,
            "projected",
            definition.Profile);
        return true;
    }

    public static ProjectedCoordinate ProjectWithFallback(string? game, double x, double z)
    {
        if (TryProject(game, x, z, out var projected)) return projected;

        var isAts = string.Equals(game, "ATS", StringComparison.OrdinalIgnoreCase);
        return new ProjectedCoordinate(
            Math.Clamp((isAts ? 39d : 51d) - z / 500000d, -85d, 85d),
            Math.Clamp((isAts ? -100d : 10d) + x / 500000d, -180d, 180d),
            "approximate-fallback",
            isAts ? "ats-fallback-v1" : "ets2-fallback-v1");
    }

    private static bool TryInverseLambert(
        LambertMapDefinition definition,
        double gameX,
        double gameZ,
        out double latitude,
        out double longitude)
    {
        latitude = longitude = 0d;
        const double degreesToRadians = Math.PI / 180d;
        const double radiansToDegrees = 180d / Math.PI;

        var parallel1 = definition.StandardParallel1 * degreesToRadians;
        var parallel2 = definition.StandardParallel2 * degreesToRadians;
        var originLatitude = definition.OriginLatitude * degreesToRadians;
        var originLongitude = definition.OriginLongitude * degreesToRadians;

        var n = Math.Log(Math.Cos(parallel1) / Math.Cos(parallel2))
                / Math.Log(
                    Math.Tan(Math.PI / 4d + parallel2 / 2d)
                    / Math.Tan(Math.PI / 4d + parallel1 / 2d));
        if (!double.IsFinite(n) || Math.Abs(n) < 1e-12) return false;

        var f = Math.Cos(parallel1)
                * Math.Pow(Math.Tan(Math.PI / 4d + parallel1 / 2d), n)
                / n;
        var rhoAtOrigin = f / Math.Pow(Math.Tan(Math.PI / 4d + originLatitude / 2d), n);
        var planeX = (gameX - definition.OffsetX) * definition.FactorX * degreesToRadians;
        var planeY = (gameZ - definition.OffsetZ) * definition.FactorZ * degreesToRadians;
        var rho = Math.Sign(n) * Math.Sqrt(planeX * planeX + Math.Pow(rhoAtOrigin - planeY, 2d));
        if (!double.IsFinite(rho) || Math.Abs(rho) < 1e-12) return false;

        var theta = Math.Atan2(planeX, rhoAtOrigin - planeY);
        latitude = (2d * Math.Atan(Math.Pow(f / rho, 1d / n)) - Math.PI / 2d) * radiansToDegrees;
        longitude = (originLongitude + theta / n) * radiansToDegrees;
        return double.IsFinite(latitude) && double.IsFinite(longitude);
    }
}
