namespace CalculableMechanics
{
    /// <summary>
    /// Trigger to turn dynamic objects into kinematic.
    /// </summary>
    [System.Serializable]
    public struct CmKinematicTrigger : IHitSubspace
    {
        public int Id { get; set; }
        public CmVector position;
        public long radius;
        private long _radiusPow;
        internal long RadiusPow
        {
            get
            {
                if (_radiusPow == 0)
                {
                    _radiusPow = CmMath.PowSave(radius);
                }
                return _radiusPow;
            }
        }

        public bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position)
        {
            return CmCollisionManager.IsHitSubspace(subspacesScale, subspacesScalePow, position, this);
        }
    }
}
