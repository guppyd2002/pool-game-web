[System.Serializable]
public struct CmSimpleVector
{
    public long x;
    public long y;
    public long z;

    public CmSimpleVector(long x, long y, long z)
    {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    public readonly static CmSimpleVector zero = new CmSimpleVector(0, 0, 0);


    public readonly static CmSimpleVector one = new CmSimpleVector(1, 1, 1);

    public readonly static CmSimpleVector right = new CmSimpleVector(1, 0, 0);

    public readonly static CmSimpleVector left = new CmSimpleVector(-1, 0, 0);

    public readonly static CmSimpleVector up = new CmSimpleVector(0, 1, 0);

    public readonly static CmSimpleVector down = new CmSimpleVector(0, -1, 0);

    public readonly static CmSimpleVector forward = new CmSimpleVector(0, 0, 1);

    public readonly static CmSimpleVector back = new CmSimpleVector(0, 0, -1);


    public readonly static CmSimpleVector One = new CmSimpleVector(CmSimpleMath.defoultMultiplier, CmSimpleMath.defoultMultiplier, CmSimpleMath.defoultMultiplier);

    public readonly static CmSimpleVector Right = new CmSimpleVector(CmSimpleMath.defoultMultiplier, 0, 0);

    public readonly static CmSimpleVector Left = new CmSimpleVector(-CmSimpleMath.defoultMultiplier, 0, 0);

    public readonly static CmSimpleVector Up = new CmSimpleVector(0, CmSimpleMath.defoultMultiplier, 0);

    public readonly static CmSimpleVector Down = new CmSimpleVector(0, -CmSimpleMath.defoultMultiplier, 0);

    public readonly static CmSimpleVector Forward = new CmSimpleVector(0, 0, CmSimpleMath.defoultMultiplier);

    public readonly static CmSimpleVector Back = new CmSimpleVector(0, 0, -CmSimpleMath.defoultMultiplier);

    public static CmSimpleVector operator +(CmSimpleVector v1, CmSimpleVector v2)
    {
        return new CmSimpleVector(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
    }

    public static CmSimpleVector operator -(CmSimpleVector v1, CmSimpleVector v2)
    {
        return new CmSimpleVector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
    }

    public static CmSimpleVector Multiply(CmSimpleVector v, long i)
    {
        return new CmSimpleVector(i * v.x / CmSimpleMath.defoultMultiplier, i * v.y / CmSimpleMath.defoultMultiplier, i * v.z / CmSimpleMath.defoultMultiplier);
    }

    public long Magnitude
    {
        get
        {
            return CmSimpleMath.Sqrt(SqrMagnitude);
        }
    }

    public long SqrMagnitude
    {
        get
        {
            return (x * x + y * y + z * z) / CmSimpleMath.defoultMultiplier;
        }
    }
    public override string ToString()
    {
        if (x == 0 && y == 0 && z == 0)
        {
            return "z";
        }
        else if ((x == 1 && y == 0 && z == 0))
        {
            return "r";
        }
        else if ((x == 0 && y == 1 && z == 0))
        {
            return "u";
        }
        else if ((x == 0 && y == 0 && z == 1))
        {
            return "f";
        }
        else if ((x == -1 && y == 0 && z == 0))
        {
            return "l";
        }
        else if ((x == 0 && y == -1 && z == 0))
        {
            return "d";
        }
        else if ((x == 0 && y == 0 && z == -1))
        {
            return "b";
        }
        else if ((x == 1 && y == 1 && z == 1))
        {
            return "o";
        }
        else if ((x == CmSimpleMath.defoultMultiplier && y == 0 && z == 0))
        {
            return "R";
        }
        else if ((x == 0 && y == CmSimpleMath.defoultMultiplier && z == 0))
        {
            return "U";
        }
        else if ((x == 0 && y == 0 && z == CmSimpleMath.defoultMultiplier))
        {
            return "F";
        }
        else if ((x == -CmSimpleMath.defoultMultiplier && y == 0 && z == 0))
        {
            return "L";
        }
        else if ((x == 0 && y == -CmSimpleMath.defoultMultiplier && z == 0))
        {
            return "D";
        }
        else if ((x == 0 && y == 0 && z == -CmSimpleMath.defoultMultiplier))
        {
            return "B";
        }
        else if ((x == CmSimpleMath.defoultMultiplier && y == CmSimpleMath.defoultMultiplier && z == CmSimpleMath.defoultMultiplier))
        {
            return "O";
        }
        else
        {
            return "(" + x + ", " + y + ", " + z + ")";
        }
    }
    public static CmSimpleVector FromString(string s)
    {
        if (s == "" || s == "z")
        {
            return zero;
        }
        switch (s)
        {
            case "r":
                return right;
            case "u":
                return up;
            case "f":
                return forward;
            case "l":
                return left;
            case "d":
                return down;
            case "b":
                return back;
            case "o":
                return one;
            case "R":
                return Right;
            case "U":
                return Up;
            case "F":
                return Forward;
            case "L":
                return Left;
            case "D":
                return Down;
            case "B":
                return Back;
            case "O":
                return One;
        }

        string strX = "";
        string strY = "";
        string strZ = "";

        long step = 1;
        foreach (char c in s)
        {
            if (c == ',')
            {
                step++;
                continue;
            }
            if (c == '(' || c == ' ' || c == ')')
            {
                continue;
            }

            switch (step)
            {
                case 1:
                    strX += c.ToString();
                    break;
                case 2:
                    strY += c.ToString();
                    break;
                case 3:
                    strZ += c.ToString();
                    break;
            }
        }

        long.TryParse(strX, out long x);
        long.TryParse(strY, out long y);
        long.TryParse(strZ, out long z);

        return new CmSimpleVector(x, y, z);
    }
}
