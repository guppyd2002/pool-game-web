public struct CmSimpleMath
{
    public const long defoultMultiplier = 10000;
    public const long sqrDefoultMultiplier = 100;

    internal static long FromFloat(float val)
    {
        return (long)(val * (float)defoultMultiplier);
    }

    internal static float FromInt(long val)
    {
        return (float)val / (float)defoultMultiplier;
    }

    public static long Abs(long val)
    {
        if (val < 0)
        {
            return -val;
        }
        else
        {
            return val;
        }
    }
    public static long Near(long val, long from, long to)
    {
        if (val > from && val < to)
        {
            long a = val - from;
            long b = to - val;
            if (a > b)
            {
                return to;
            }
            else
            {
                return from;
            }
        }
        else if (val <= from)
        {
            return from;
        }
        else
        {
            return to;
        }
    }
    public static long Sqrt(long val)
    {
        if (val < 1)
        {
            return 0;
        }
        if (val == 1)
        {
            return sqrDefoultMultiplier * 1;
        }

        long pow = 10;

        while (val > pow * pow)
        {
            pow *= 10;
        }

        long x1 = pow / 10;
        long x2 = pow;
        long xm = (x1 + x2) / 2;

        while (Abs(x1 - x2) > 1)
        {
            if (val <= xm * xm)
            {
                x2 = xm;
            }
            else
            {
                x1 = xm;
            }
            xm = (x1 + x2) / 2;
        }

        long from = x1 * x1;
        long to = x2 * x2;
        long valNear = Near(val, from, to);

        if (valNear == from)
        {
            return sqrDefoultMultiplier * x1;
        }
        else
        {
            return sqrDefoultMultiplier * x2;
        }
    }
}
