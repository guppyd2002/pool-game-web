namespace CalculableMechanics
{
    [System.Serializable]
    public class CmRigidbodyState
    {
        public bool IsActive;
        public bool IsOutOfCube;
        public bool IsKinematic;
        public int KinematicTriggerId;
        public CmVector Position;
        public CmVector Right;
        public CmVector Up;
        public CmVector Forward;
        public CmVector Velocity;
        public CmVector AngularVelocity;
        public CmVector FirstHitDirection;

        public CmRigidbodyState(bool isActive, CmVector position,
            CmVector velocity, CmVector angularVelocity, CmVector firstHitDirection, bool isKinematic, bool isOutOfCube)
        {
            IsActive = isActive;
            IsOutOfCube = isOutOfCube;
            Position = position;
            Velocity = velocity;
            AngularVelocity = angularVelocity;
            FirstHitDirection = firstHitDirection;

            Right = CmVector.One;
            Up = CmVector.zero;
            Forward = CmVector.zero;

            IsKinematic = isKinematic;
            KinematicTriggerId = -1;
        }

        public CmRigidbodyState(CmRigidbody cmRigidbody)
        {
            IsActive = cmRigidbody.IsActive;
            IsKinematic = cmRigidbody.IsKinematic;
            IsOutOfCube = cmRigidbody.IsOutOfCube;
            KinematicTriggerId = cmRigidbody.KinematicTriggerId;
            Position = cmRigidbody.collider.Position;
            Right = cmRigidbody.collider.Right;
            Up = cmRigidbody.collider.Up;
            Forward = cmRigidbody.collider.Forward;
            Velocity = cmRigidbody.Velocity;
            AngularVelocity = cmRigidbody.AngularVelocity;
            FirstHitDirection = cmRigidbody.FirstHitDirection;
        }

        /// <summary>
        /// Tos the state of the string. for example "1:0:3:49:(30,45,30):z:o:z:z:z"
        /// </summary>
        /// <returns>The string state.</returns>
        public string ToStringState()
        {
            return (IsActive ? "1:" : "0:") + (IsKinematic ? "1:" : "0:") +
                   (IsOutOfCube ? "1:" : "0:") + KinematicTriggerId + ":" +
                   Position + ":" + Right + ":" +
                   Up + ":" + Forward + ":" + Velocity + ":" + AngularVelocity + ":" + FirstHitDirection;
        }
        /// <summary>
        /// Initializes a new instance from string
        /// </summary>
        /// <param name="stringState">String state.</param>
        public CmRigidbodyState(string stringState)
        {
            IsActive = false;
            IsKinematic = false;
            IsOutOfCube = false;
            KinematicTriggerId = 0;
            Position = CmVector.zero;
            Right = CmVector.Right;
            Up = CmVector.Up;
            Forward = CmVector.Forward;
            Velocity = CmVector.zero;
            AngularVelocity = CmVector.zero;
            FirstHitDirection = CmVector.zero;
            string str = "";
            int id = 0;
            foreach (var item in stringState)
            {
                if (item == ':')
                {
                    switch (id)
                    {
                        case 0:
                            IsActive = int.Parse(str) == 1;
                            break;
                        case 1:
                            IsKinematic = int.Parse(str) == 1;
                            break;
                        case 2:
                            IsOutOfCube = int.Parse(str) == 1;
                            break;
                        case 3:
                            KinematicTriggerId = int.Parse(str);
                            break;
                        case 4:
                            Position = CmVector.FromString(str);
                            break;
                        case 5:
                            Right = CmVector.FromString(str);
                            break;
                        case 6:
                            Up = CmVector.FromString(str);
                            break;
                        case 7:
                            Forward = CmVector.FromString(str);
                            break;
                        case 8:
                            Velocity = CmVector.FromString(str);
                            break;
                        case 9:
                            AngularVelocity = CmVector.FromString(str);
                            break;
                    }
                    str = "";
                    id++;
                }
                else
                {
                    str += item;
                }
            }
            FirstHitDirection = CmVector.FromString(str);           
        }
    }
}
