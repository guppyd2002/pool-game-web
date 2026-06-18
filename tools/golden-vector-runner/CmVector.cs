namespace CalculableMechanics
{
    [System.Serializable]
    public struct CmVector
    {
        public long x;
        public long y;
        public long z;
        private readonly int hashKey;

        public CmVector(long x, long y, long z)
        {
            this.x = x;
            this.y = y;
            this.z = z;
            this.hashKey = (x + 2 * y + 3 * z).GetHashCode();

        }
        public CmVector(CmSimpleVector simpleVector)
        {
            this.x = simpleVector.x;
            this.y = simpleVector.y;
            this.z = simpleVector.z;
            this.hashKey = (x + 2 * y + 3 * z).GetHashCode();
        }
        public CmSimpleVector ToCmSimpleVector()
        {
            return new CmSimpleVector(x, y, z);
        }

        public static CmVector gravity = new CmVector(0, -98100, 0);
        internal long SqrMagnitude
        {
            get
            {
                return (x * x + y * y + z * z) / CmMath.defoultMultiplier;
            }
        }

        internal static long MaxXYZ(CmVector a, CmVector b)
        {
            return CmMath.Max(CmMath.Abs(a.x - b.x), CmMath.Abs(a.y - b.y), CmMath.Abs(a.z - b.z));
        }

        internal long Magnitude
        {
            get
            {
                return CmMath.Sqrt(SqrMagnitude);
            }
        }

        internal CmVector Normalized
        {
            get
            {
                long mgn = Magnitude;
                if (mgn == 0)
                {
                    return zero;
                }
                return new CmVector((this.x * CmMath.defoultMultiplier) / mgn, (this.y * CmMath.defoultMultiplier) / mgn, (this.z * CmMath.defoultMultiplier) / mgn);
            }
        }

        public static CmVector operator +(CmVector v1, CmVector v2)
        {
            return new CmVector(v1.x + v2.x, v1.y + v2.y, v1.z + v2.z);
        }

        public static CmVector operator -(CmVector v1, CmVector v2)
        {
            return new CmVector(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
        }

        public static CmVector operator -(CmVector v)
        {
            return new CmVector(-v.x, -v.y, -v.z);
        }

        public static CmVector operator *(long i, CmVector v)
        {
            return new CmVector(i * v.x, i * v.y, i * v.z);
        }

        public static CmVector operator *(CmVector v, long i)
        {
            return new CmVector(i * v.x, i * v.y, i * v.z);
        }

        public static CmVector operator /(CmVector v, long i)
        {
            return new CmVector(v.x / i, v.y / i, v.z / i);
        }

        public static bool operator ==(CmVector v1, CmVector v2)
        {
            return v1.x == v2.x && v1.y == v2.y && v1.z == v2.z;
        }

        public static bool operator !=(CmVector v1, CmVector v2)
        {
            return v1.x != v2.x || v1.y != v2.y || v1.z != v2.z;
        }

        public override bool Equals(object obj)
        {
            return (CmVector)obj == this;
        }

        public override int GetHashCode()
        {
            return hashKey;
        }

        public override string ToString()
        {
            return ToCmSimpleVector().ToString();
        }
        /// <summary>
        /// Create CmVector froms the string.
        /// </summary>
        internal static CmVector FromString(string s)
        {
            return new CmVector(CmSimpleVector.FromString(s));
        }
        public long ToLongKey()
        {
            return x + y + z;
        }

        internal readonly static CmVector zero = new CmVector(0, 0, 0);
    

        internal readonly static CmVector one = new CmVector(1, 1, 1);
  
        internal readonly static CmVector right = new CmVector(1, 0, 0);
   
        internal readonly static CmVector left = new CmVector(-1, 0, 0);
     
        internal readonly static CmVector up = new CmVector(0, 1, 0);
  
        internal readonly static CmVector down = new CmVector(0, -1, 0);
     
        internal readonly static CmVector forward = new CmVector(0, 0, 1);
    
        internal readonly static CmVector back = new CmVector(0, 0, -1);


        internal readonly static CmVector One = new CmVector(CmMath.defoultMultiplier, CmMath.defoultMultiplier, CmMath.defoultMultiplier);

        internal readonly static CmVector Right = new CmVector(CmMath.defoultMultiplier, 0, 0);

        internal readonly static CmVector Left = new CmVector(-CmMath.defoultMultiplier, 0, 0);

        internal readonly static CmVector Up = new CmVector(0, CmMath.defoultMultiplier, 0);

        internal readonly static CmVector Down = new CmVector(0, -CmMath.defoultMultiplier, 0);

        internal readonly static CmVector Forward = new CmVector(0, 0, CmMath.defoultMultiplier);

        internal readonly static CmVector Back = new CmVector(0, 0, -CmMath.defoultMultiplier);


        public static CmVector Abs(CmVector v)
        {
            return new CmVector(CmMath.Abs(v.x), CmMath.Abs(v.y), CmMath.Abs(v.z));
        }


        public static CmVector MaxAbs(params CmVector[] args)
        {
            long[] x = new long[args.Length];
            long[] y = new long[args.Length];
            long[] z = new long[args.Length];
            for (int i = 0; i < args.Length; i++)
            {
                x[i] = args[i].x;
                y[i] = args[i].y;
                z[i] = args[i].z;
            }
            return new CmVector(CmMath.Abs(CmMath.Max(x)), CmMath.Abs(CmMath.Max(y)), CmMath.Abs(CmMath.Max(z)));
        }

        internal static CmVector Normalize(CmVector val)
        {
            long mgn = val.Magnitude;
            if (mgn == 0)
            {
                return zero;
            }
            else
            {
                return (val * CmMath.defoultMultiplier) / mgn;
            }
        }

        internal static CmVector ClampMagnitude(CmVector val, long minLength = 0, long maxLength = 10000)
        {
            long mgn = val.Magnitude;
            if (mgn == 0)
            {
                return zero;
            }
            else
            {
                return (CmMath.Clamp(mgn, minLength, maxLength) * val.Normalized) / CmMath.defoultMultiplier;
            }
        }

        internal static long Distance(CmVector v1, CmVector v2)
        {
            if(v1 == v2)
            {
                return 0;
            }
            return (v1 - v2).Magnitude;
        }

        internal static long SqrDistance(CmVector v1, CmVector v2)
        {
            if (v1 == v2)
            {
                return 0;
            }
            return (v1 - v2).SqrMagnitude;
        }

        internal static CmVector Cross(CmVector lhs, CmVector rhs)
        {
            if(lhs == CmVector.zero || rhs == CmVector.zero)
            {
                return CmVector.zero;
            }
            return new CmVector((lhs.y * rhs.z - rhs.y * lhs.z) / CmMath.defoultMultiplier,
                                (-lhs.x * rhs.z + rhs.x * lhs.z) / CmMath.defoultMultiplier,
                                (lhs.x * rhs.y - rhs.x * lhs.y) / CmMath.defoultMultiplier);
        }

        internal static CmVector Lerp(CmVector from, CmVector to, long time01)
        {
            return Multiply(to - from, time01) + from;
        }
        internal static CmVector Lerp(CmVector from, CmVector to, long time, long maxTime)
        {
            return (from * (maxTime - time) + to * time) / maxTime;
        }

        internal static long Dot(CmVector lhs, CmVector rhs)
        {
            return (lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z) / CmMath.defoultMultiplier;
        }
        internal static CmVector Project(CmVector vector, CmVector vectorNormal)
        {
            if(vector == CmVector.zero)
            {
                return CmVector.zero;
            }
            long dot = Dot(vector, vectorNormal);
            return new CmVector((dot * vectorNormal.x) / CmMath.defoultMultiplier, 
                                (dot * vectorNormal.y) / CmMath.defoultMultiplier, 
                                (dot * vectorNormal.z) / CmMath.defoultMultiplier);
        }

        internal static CmVector ProjectOnPlane(CmVector vector, CmVector planeNormal)
        {
            if (vector == CmVector.zero)
            {
                return CmVector.zero;
            }
            return vector - Project(vector, planeNormal);
        }

        internal static CmVector ProjectPointOnAxis(CmVector point, CmVector pointOnAxis, CmVector axis)
        {
            return pointOnAxis + Project(point - pointOnAxis, axis);
        }

        internal static long PointDistance(CmVector point, CmVector pointOnAxis, CmVector axis)
        {
            return CmVector.Distance(point, ProjectPointOnAxis(point, pointOnAxis, axis));
        }

        internal static long PointSqrDistance(CmVector point, CmVector pointOnAxis, CmVector axis)
        {
            return CmVector.SqrDistance(point, ProjectPointOnAxis(point, pointOnAxis, axis));
        }

        internal static CmVector ProjectPointOnPlane(CmVector point, CmVector pointOnPlane, CmVector planeNormal)
        {
            return point - Project(point - pointOnPlane, planeNormal);
        }
        internal static CmVector Multiply(CmVector v, long i)
        {
            return new CmVector(i * v.x / CmMath.defoultMultiplier, i * v.y / CmMath.defoultMultiplier, i * v.z / CmMath.defoultMultiplier);
        }

        internal static CmVector Divide(CmVector v, long i)
        {
            return new CmVector(v.x * CmMath.defoultMultiplier / i, v.y * CmMath.defoultMultiplier / i, v.z * CmMath.defoultMultiplier / i);
        }
    }
}
