
namespace CalculableMechanics
{
    /// <summary>
    /// Kinematic state of rigid body, for moving them in case of dedicated server.
    /// </summary>
    public struct CmKinematicState
    {
        public int id;
        public long time;
        public bool isActive;
        public CmSimpleVector position;
        public CmSimpleVector velocity;
        public CmSimpleVector angularVelocity;
        public bool isKinematic;
        public int kinematicTriggerId;
        public bool isOutOfCube;

        public CmKinematicState(int id, long time, bool isActive, CmSimpleVector position, CmSimpleVector velocity, CmSimpleVector angularVelocity, bool isKinematic, int kinematicTriggerId, bool isOutOfCube)
        {
            this.id = id;
            this.time = time;
            this.isActive = isActive;
            this.position = position;
            this.velocity = velocity;
            this.angularVelocity = angularVelocity;
            this.isKinematic = isKinematic;
            this.kinematicTriggerId = kinematicTriggerId;
            this.isOutOfCube = isOutOfCube;
        }

        public override string ToString()
        {
            return id + ":" + time + ":" + isActive + ":" + position + ":" + isKinematic + ":" + kinematicTriggerId + ":" + isOutOfCube + ":" + velocity + ":" + angularVelocity + ":";
        }

        /*public static List<CmKinematicState> GetKinematicStates(string stringState)
        {
            List<CmKinematicState> states = new List<CmKinematicState>(0);
            string str = "";
            int strId = 0;

            int id = 0;
            long time = 0;
            bool isActive = false;
            CmSimpleVector position = CmSimpleVector.zero;
            bool isKinematic = false;
            int kinematicTriggerId = -1;
            CmSimpleVector velocity = CmSimpleVector.zero;
            CmSimpleVector angularVelocity = CmSimpleVector.zero;
            bool isOutOfCube = false;

            foreach (var item in stringState)
            {
                if (item == ':')
                {
                    switch (strId)
                    {
                        case 0:
                            id = int.Parse(str);
                            break;
                        case 1:
                            time = long.Parse(str);
                            break;
                        case 2:
                            isActive = bool.Parse(str);
                            break;
                        case 3:
                            position = CmSimpleVector.FromString(str);
                            break;
                        case 4:
                            isKinematic = bool.Parse(str);
                            break;
                        case 5:
                            kinematicTriggerId = int.Parse(str);
                            break;
                        case 6:
                            isOutOfCube = bool.Parse(str);
                            break;
                        case 7:
                            velocity = CmSimpleVector.FromString(str);
                            break;
                        case 8:
                            angularVelocity = CmSimpleVector.FromString(str);
                            break;
                    }
                    str = "";
                    if (strId == 8)
                    {
                        strId = 0;
                        states.Add(new CmKinematicState(id, time, isActive, position, velocity, angularVelocity, isKinematic, kinematicTriggerId, isOutOfCube));
                    }
                    else
                    {
                        strId++;
                    }

                }
                else
                {
                    str += item;
                }
            }
            return states;
        }

        public static CmSimpleVector GetPositionAt(long time, CmKinematicState state1, CmKinematicState state2)
        {
            long t = CmMath.Divide(time - state1.time, state2.time - state1.time);

            return state1.position + CmSimpleVector.Multiply(state1.velocity, time - state1.time) +
                         CmSimpleVector.Multiply(state2.position - state1.position - CmSimpleVector.Multiply(state1.velocity, state2.time - state1.time), CmMath.Pow(t, 2));
        }

        public static long GetRotateNormalizeTime(long time, long minAngularVelocity, CmKinematicState state1, CmKinematicState state2)
        {
            long t = CmMath.Divide(time - state1.time, state2.time - state1.time);
            long av1 = state1.angularVelocity.Magnitude;
            long av2 = state2.angularVelocity.Magnitude;
            if (CmMath.Abs(av1 - av2) < minAngularVelocity * CmMath.defoultMultiplier)
            {
                return t;
            }
            else
            {
                long av = CmMath.Divide(av2 - av1, CmMath.Sqrt(av1 * av1 + av2 * av2));
                return CmMath.Multiply(av, CmMath.Pow(t, 2)) + CmMath.Multiply(CmMath.defoultMultiplier - av, t);
            }
        }*/
    }
}
