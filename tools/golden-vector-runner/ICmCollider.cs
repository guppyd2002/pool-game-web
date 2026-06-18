namespace CalculableMechanics
{
    /// <summary>
    /// A physical shape of objects.
    /// </summary>
    public interface ICmCollider
    {
        bool Enabled { get; set; }
        int Id { get; set; }
        int InstanceId { get; set; }
        CmVector Position { get; set; }
        CmVector Right { get; set; }
        CmVector Up { get; set; }
        CmVector Forward { get; set; }
        CmVector Scale { get; set; }
        long Radius { get; set; }
        long RadiusPow { get; }
        long MomentOfInertia { get; set; }
        CmMaterial Material { get; set; }
       

        long GetMomentOfInertia(CmVector centreOfMass, CmVector axis);
        bool IsHit(ICmCollider other, out CmHitInfo hitInfo);
        bool IsHit(CmKinematicTrigger trigger, out CmHitInfo hitInfo);
        bool IsHitSphere(CmVector point, long radius, out CmHitInfo hitInfo);
        bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position);
        CmVector GetSubspaceScale();
    }

    public struct CmHitInfo
    {
        internal bool IsBody
        {
            get;
            private set;
        }

        internal CmVector Point
        {
            get;
            private set;
        }

        internal CmVector Normal
        {
            get;
            private set;
        }

        internal ICmCollider Collider
        {
            get;
            private set;
        }

        internal CmHitInfo(CmVector point, CmVector normal, ICmCollider collider)
        {
            IsBody = false;
            this.Point = point;
            this.Normal = normal;
            this.Collider = collider;
        }

        internal CmHitInfo(bool isBody, CmVector point, CmVector normal, ICmCollider collider)
        {
            IsBody = isBody;
            this.Point = point;
            this.Normal = normal;
            this.Collider = collider;
        }

        public override bool Equals(object obj)
        {
            CmHitInfo other = (CmHitInfo)obj;
            return Point == other.Point && Normal == other.Normal &&
                Collider.Id == other.Collider.Id && other.IsBody == IsBody;
        }
        public override int GetHashCode()
        {
            return base.GetHashCode();
        }
    }
}
