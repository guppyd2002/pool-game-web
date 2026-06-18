using System.Collections.Generic;
namespace CalculableMechanics
{
    internal struct CmMath
    {
        internal const long defoultMultiplier = CmSimpleMath.defoultMultiplier;
        internal const long sqrDefoultMultiplier = CmSimpleMath.sqrDefoultMultiplier;
        internal const long PI = 31415;

        internal static long FromFloat(float val)
        {
            return CmSimpleMath.FromFloat(val);
        }

        internal static float FromLong(long val)
        {
            return CmSimpleMath.FromInt(val);
        }

        internal static long Min(params int[] args)
        {
            if (args == null || args.Length == 0)
            {
                return 0;
            }
            long min = args [0];
            for (long i = 1; i < args.Length; i++)
            {
                if(args[i] < min)
                {
                    min = args[i];
                }
            }
            return min;
        }

        internal static long Max(params long[] args)
        {
            if (args == null || args.Length == 0)
            {
                return 0;
            }
            long max = args [0];
            for (long i = 1; i < args.Length; i++)
            {
                if(args[i] > max)
                {
                    max = args[i];
                }
            }
            return max;
        }


        internal static long ClampMin(long val, long minVal = 0)
        {
            if (val - minVal < 0)
            {
                return minVal;
            }
            else
                return val;
        }
        internal static long ClampMax(long val, long maxVal = 1)
        {
            if (val - maxVal > 0)
            {
                return maxVal;
            }
            else
                return val;
        }
        internal static long Clamp(long val, long minVal = 0, long maxVal = 1)
        {
            if (val - minVal < 0)
            {
                return minVal;
            } else if (val - maxVal > 0)
            {
                return maxVal;
            } else
                return val;
        }

        internal static long Abs(long val)
        {
            return CmSimpleMath.Abs(val);
        }

        internal static long Lerp (long from, long to, long time010000)
        {
            return from + ((to - from) * time010000) / 10000;
        }
        internal static long Near (long val, long from, long to)
        {
            return CmSimpleMath.Near(val, from, to);
        }
        private static Dictionary<long, long> sqrts = new Dictionary<long, long>(0);

        internal static long SqrtSave(long val)
        {
            if (!sqrts.ContainsKey(val))
            {
                long result = CmSimpleMath.Sqrt(val);
                sqrts.Add(val, result);
                return result;
            }
            else
            {
                return sqrts[val];
            }
        }
        /// <summary>
        /// The sqrt of val, val is less than int.MaxValue;
        /// </summary>
        internal static long Sqrt(long val)
        {
            return CmSimpleMath.Sqrt(val);
        }
        private static Dictionary<long, long> pows = new Dictionary<long, long>(0);
        internal static long PowSave(long val)
        {
            if (!pows.ContainsKey(val))
            {
                long result = Multiply(val, val);
                pows.Add(val, result);
                return result;
            }
            else
            {
                return pows[val];
            }
        }
        internal static long Pow(long val, long pow)
        {
            long result = val;
            for (long i = 1; i < pow; i++)
            {
                result = Multiply(result, val);
            }
            return result;
        }
        internal static long Multiply(long val1, long val2)
        {
            return (val1 * val2) / defoultMultiplier;
        }

        internal static long Divide(long val1, long val2)
        {
            return (val1 * defoultMultiplier) / val2;
        }       
    }
}
