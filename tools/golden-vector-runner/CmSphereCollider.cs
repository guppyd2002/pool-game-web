namespace CalculableMechanics
{
    [System.Serializable]
    public class CmSphereCollider : ICmCollider
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
            if (other is CmSphereCollider)
            {
                return CmCollisionManager.IsHit(this, (CmSphereCollider)other, out hitInfo);
            }
            else if (other is CmBoxCollider)
            {
                return CmCollisionManager.IsHit(this, (CmBoxCollider)other, out hitInfo);
            }
            else if (other is CmLineCollider)
            {
                return CmCollisionManager.IsHit(this, (CmLineCollider)other, out hitInfo);
            }
            else if (other is CmPlaneCollider)
            {
                return CmCollisionManager.IsHit(this, (CmPlaneCollider)other, out hitInfo);
            }

            hitInfo = new CmHitInfo();
            return false;
        }
        public bool IsHitSphere(CmVector point, long radius, out CmHitInfo hitInfo)
        {
            if (!Enabled)
            {
                hitInfo = new CmHitInfo();
                return false;
            }
            return CmCollisionManager.IsHitSphere(this, point, radius, out hitInfo);
        }
        public bool IsHit(CmKinematicTrigger trigger, out CmHitInfo hitInfo)
        {
            return CmCollisionManager.IsHit(this, trigger, out hitInfo);
        }
        public bool IsHitSubspace(long SubspacesScale, long subspacesScalePow, CmVector pos)
        {
            return CmCollisionManager.IsHitSubspace(SubspacesScale, subspacesScalePow, pos, this);
        }
        public CmVector GetSubspaceScale()
        {
            return Scale;
        }

        public static implicit operator bool(CmSphereCollider cmCollider)
        {
            return cmCollider != default(CmSphereCollider);
        }
    }
}