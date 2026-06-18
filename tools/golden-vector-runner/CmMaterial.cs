namespace CalculableMechanics
{
    /// <summary>
    /// A mechanics properties of physical colliders.
    /// </summary>
    [System.Serializable]
    public struct CmMaterial
    {
        public long bounciness;
        public long rollingFriction;
        public long twistingFriction;
        public long dynamicFriction;
        public long staticFriction;

        public CmMaterial(long bounciness, long rollingFriction, long twistingFriction, long dynamicFriction, long staticFriction)
        {
            this.bounciness = bounciness;
            this.rollingFriction = rollingFriction;
            this.twistingFriction = twistingFriction;
            this.dynamicFriction = dynamicFriction;
            this.staticFriction = staticFriction;
        }

        public override string ToString()
        {
            return "b:" + bounciness + ", " + "r:" + rollingFriction + ", " + "t:" + twistingFriction + ", " + "d:" + dynamicFriction + ", " + "s:" + staticFriction;
        }
    }
}
