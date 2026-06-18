namespace CalculableMechanics
{
    [System.Serializable]
    public class CmLineCollider : ICmCollider
    {
        public CmVector position;
        public CmVector right;
        public CmVector up;
        public CmVector forward;
        public CmVector scale;
        public long radius;
        public long momentOfInertia;
        public CmMaterial material;

        public bool Enabled { get; set; }
        public int Id { get; set; }
        public int InstanceId { get; set; }
        public CmVector Position { get { return position; } set { position = value; } }
        public CmVector Right { get { return right; } set { right = value; } }
        public CmVector Up { get { return up; } set { up = value; } }
        public CmVector Forward { get { return forward; } set { forward = value; } }
        public CmVector Scale { get { return scale; } set { scale = value; } }
        public long Radius { get { return radius; } set { radius = value; } }
        public long MomentOfInertia { get { return momentOfInertia; } set { momentOfInertia = value; } }
        public CmMaterial Material { get { return material; } set { material = value; } }

        private long radiusPow;
        public long RadiusPow
        {
            get
            {
                if (radiusPow == 0)
                {
                    radiusPow = CmMath.PowSave(radius);
                }
                return radiusPow;
            }
        }

        private long _scalexPow;
        internal long ScalexPow
        {
            get
            {
                if (_scalexPow == 0)
                {
                    _scalexPow = CmMath.PowSave(Scale.x);
                }
                return _scalexPow;
            }
        }

        public long GetMomentOfInertia(CmVector centreOfMass, CmVector axis)
        {
            if (MomentOfInertia == 0)
            {
                MomentOfInertia = (2 * RadiusPow) / 5;
            }
            return MomentOfInertia;
        }

        public bool IsHit(ICmCollider other, out CmHitInfo hitInfo)
        {
            hitInfo = new CmHitInfo();
            return false;
        }
        public bool IsHit(CmKinematicTrigger trigger, out CmHitInfo hitInfo)
        {
            hitInfo = new CmHitInfo();
            return false;
        }
        public bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector pos)
        {
            return CmCollisionManager.IsHitSubspace(subspacesScale, subspacesScalePow, pos, this);
        }
        public CmVector GetSubspaceScale()
        {
            CmVector vector = new CmVector(CmVector.Dot(Right, CmMath.defoultMultiplier * CmVector.right), CmVector.Dot(Right, CmMath.defoultMultiplier * CmVector.up), CmVector.Dot(right, CmMath.defoultMultiplier * CmVector.forward));
            return (Scale.x * CmVector.Abs(vector)) / CmMath.defoultMultiplier;
        }

        public bool IsHitSphere(CmVector point, long radius, out CmHitInfo hitInfo)
        {
            if(!Enabled)
            {
                hitInfo = new CmHitInfo();
                return false;
            }
            return CmCollisionManager.IsHitSphere(point, radiusPow, this, out hitInfo);
        }
    }
}