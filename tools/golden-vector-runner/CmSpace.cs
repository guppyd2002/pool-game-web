using System.Collections.Generic;

namespace CalculableMechanics
{
    internal interface IHitSubspace
    {
        bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position);
    }

    /// <summary>
    /// A physical space for controlling rigid bodies.
    /// </summary>
    public class CmSpace
    {
        private const int precision = 2;
        private const int minTS = 50;
        private const int maxTS = 200;
        public bool IsActive { get; private set; }
        public Queue<CmRigidbody> ActiveBodies { get; private set; }
        public int BodiesCount { get; private set; }
        /// <summary>
        /// Spaces are divided into subspaces to quickly find potential colliding rigid bodies.
        /// </summary>
        public Dictionary<CmVector, Queue<int>> DynamicSubspaces { get; private set; }
        /// <summary>
        /// Spaces are divided into subspaces to quickly find potential colliding rigid bodies with static colliders.
        /// </summary>
        public Dictionary<CmVector, Queue<int>> StaticSubspaces { get; private set; }
        /// <summary>
        /// Spaces are divided into subspaces to quickly find potential colliding rigid bodies with kinematic triggers.
        /// </summary>
        public Dictionary<CmVector, Queue<int>> KinematicSubspaces { get; private set; }

        private CmSpaceCube SpaceCube { get; set; }
        public List<CmRigidbody> Rigidbodies { get; private set; }
        public List<ICmCollider> Colliders { get; private set; }
        private List<ICmCollider> startColliders;
        public List<CmKinematicTrigger> Triggers { get; private set; }
        public long SubspacesScale { get; private set; }
        public long SubspacesScaleHalf { get; private set; }
        public long SubspacesScalePow { get; private set; }
        public Dictionary<int,ICmCollider> GetCollider { get; private set; }
        public string KinematicStates { get; private set; }
        public long Timestep { get; private set; }
        private long CalculateTime { get; set; }
        private CmSpaceState spaceState;

        public void SetState(CmSpaceState state, System.Action<CmRigidbody> bodyUpdateCallback)
        {
            for (int i = 0; i < state.States.Length; i++)
            {
                Rigidbodies[i].SetState(state.States[i]);               
            }
            for (int i = 0; i < state.States.Length; i++)
            {
                CmRigidbody body = Rigidbodies[i];
                if (!body.IsKinematic && !body.IsOutOfCube)
                {
                    CreateSubspace(body);
                }
                bodyUpdateCallback?.Invoke(Rigidbodies[i]);
            }
        }

        public void SetState(string stringState, System.Action<CmRigidbody> bodyUpdateCallback)
        {
            SetState(new CmSpaceState(stringState), bodyUpdateCallback);
        }

        public CmSpaceState GetState()
        {
            return new CmSpaceState(this);
        }
       
        public void SaveState()
        {
            spaceState = GetState();
        }

        public void ResstetSavedState(System.Action<CmRigidbody> bodyUpdateCallback)
        {
            SetState(spaceState, bodyUpdateCallback);
        }

        public string GetStringState()
        {
            return new CmSpaceState(this).ToStringState();
        }

        private int instanceId;

        public void Init(CmSpaceCube cmSpaceCube, List<CmRigidbody> cmRigidbodies, List<ICmCollider> cmColliders, List<CmKinematicTrigger> cmKinematicTrigger)
        {
            SpaceCube = cmSpaceCube;

            List<CmRigidbody> bodies = new List<CmRigidbody>(0);
            List<ICmCollider> colls = new List<ICmCollider>(0);
            List<CmKinematicTrigger> triggers = new List<CmKinematicTrigger>(0);
            GetCollider = new Dictionary<int, ICmCollider>(0);

            instanceId = 0;
            SubspacesScale = 0;
            
            ActiveBodies = new Queue<CmRigidbody>(0);

            BodiesCount = cmRigidbodies.Count;

            foreach (CmRigidbody body in cmRigidbodies)
            {
                long sSize = 8 * body.collider.Radius;
                if (SubspacesScale < sSize)
                {
                    SubspacesScale = sSize;
                }
                body.collider.InstanceId = instanceId;
                body.collider.Enabled = true;
                body.Init();
                bodies.Add(body);
                ActiveBodies.Enqueue(body);
                GetCollider.Add(instanceId, body.collider);
                instanceId++;
            }
            Rigidbodies = bodies;
            SubspacesScaleHalf = SubspacesScale / 2;
            SubspacesScalePow = CmMath.PowSave(SubspacesScale);

            foreach (ICmCollider collider in cmColliders)
            {
                collider.InstanceId = instanceId;
                collider.Enabled = true;
                colls.Add(collider);
                GetCollider.Add(instanceId, collider);
                instanceId++;
            }
            Colliders = colls;
            startColliders = new List<ICmCollider>(colls);

            foreach (CmRigidbody body in cmRigidbodies)
            {
                body.InstanceId = instanceId;
                instanceId++;
            }

            foreach (CmKinematicTrigger trigger in cmKinematicTrigger)
            {
                triggers.Add(trigger);
            }
            Triggers = triggers;

            StaticSubspaces = new Dictionary<CmVector, Queue<int>>(0);
            DynamicSubspaces = new Dictionary<CmVector, Queue<int>>(0);
            KinematicSubspaces = new Dictionary<CmVector, Queue<int>>(0);
            foreach (ICmCollider collider in cmColliders)
            {
                CreateSubspaces(collider.Id, collider.Position, collider.GetSubspaceScale() / 2, StaticSubspaces, collider);
            }
            foreach (CmKinematicTrigger trigger in cmKinematicTrigger)
            {
                CreateSubspaces(trigger.Id, trigger.position, trigger.radius * CmVector.one , KinematicSubspaces, trigger);
            }
            Activate();
        }

        public void RessetFirstHitDirections()
        {
            foreach (var item in Rigidbodies)
            {
                item.FirstHitDirection = CmVector.zero;
            }
        }

        public void SetFirstHitDirection(int bodyId, CmVector direction1, CmVector direction2)
        {
            Rigidbodies[0].FirstHitDirection = direction1;
            Rigidbodies[bodyId].FirstHitDirection = direction2;
        }

        public void AddColiders(List<ICmCollider> cmColliders)
        {
            int newInstanceId = instanceId;
            int colliderId = startColliders.Count;

            List<ICmCollider> colls = new List<ICmCollider>(startColliders);

            for (int i = 0; i < cmColliders.Count; i++)
            {
                ICmCollider collider = cmColliders[i];
                collider.InstanceId = newInstanceId;
                collider.Id = colliderId;
                collider.Enabled = true;
                colls.Add(collider);
                GetCollider.Add(newInstanceId, collider);
                newInstanceId++;
                colliderId++;
                cmColliders[i] = collider;
            }
            Colliders = new List<ICmCollider>(colls);
            foreach (ICmCollider collider in cmColliders)
            {
                CreateSubspaces(collider.Id, collider.Position, collider.GetSubspaceScale() / 2, StaticSubspaces, collider);
            }
        }

        public void RessetColiders()
        {
            if (startColliders.Count == Colliders.Count)
            {
                return;
            }

            List<ICmCollider> savedList = new List<ICmCollider>(startColliders);
            Colliders = savedList;

            GetCollider.Clear();
            StaticSubspaces.Clear();
            foreach (ICmCollider collider in savedList)
            {
                CreateSubspaces(collider.Id, collider.Position, collider.GetSubspaceScale() / 2, StaticSubspaces, collider);
            }
        }

        private void CreateSubspaces(int id, CmVector position, CmVector colliderSubspaceScaleHalf, 
        Dictionary<CmVector, Queue<int>> subspaces, IHitSubspace hitSubspace)
        {
            for (CmVector vx = position - (colliderSubspaceScaleHalf.x + SubspacesScale) * CmVector.right; vx.x <= position.x + colliderSubspaceScaleHalf.x + SubspacesScale; vx += SubspacesScale * CmVector.right)
            {
                for (CmVector vy = position - (colliderSubspaceScaleHalf.y + SubspacesScale) * CmVector.up; vy.y <= position.y + colliderSubspaceScaleHalf.y + SubspacesScale; vy += SubspacesScale * CmVector.up)
                {
                    for (CmVector vz = position - (colliderSubspaceScaleHalf.z + SubspacesScale) * CmVector.forward; vz.z <= position.z + colliderSubspaceScaleHalf.z + SubspacesScale; vz += SubspacesScale * CmVector.forward)
                    {
                        CmVector sPosition = new CmVector(vx.x, vy.y, vz.z);
                        CmVector onePosition = GetOnePosition(sPosition);

                        if (!(onePosition.x - SubspacesScaleHalf > position.x + colliderSubspaceScaleHalf.x || onePosition.x + SubspacesScaleHalf < position.x - colliderSubspaceScaleHalf.x ||
                             onePosition.y - SubspacesScaleHalf > position.y + colliderSubspaceScaleHalf.y || onePosition.y + SubspacesScaleHalf < position.y - colliderSubspaceScaleHalf.y ||
                             onePosition.z - SubspacesScaleHalf > position.z + colliderSubspaceScaleHalf.z || onePosition.z + SubspacesScaleHalf < position.z - colliderSubspaceScaleHalf.z
                            ))
                        {
                            if (hitSubspace.IsHitSubspace(SubspacesScale, SubspacesScalePow, onePosition))
                            {
                                CreateSubspace(onePosition, id, subspaces);
                            }
                        }
                    }
                }
            }
        }

        private void CreateSubspaces(int id, CmVector position, CmVector colliderSubspaceScaleHalf,
        Dictionary<CmVector, Queue<int>> subspaces, ICmCollider iCmCollider)
        {
            for (CmVector vx = position - (colliderSubspaceScaleHalf.x + SubspacesScale) * CmVector.right; vx.x <= position.x + colliderSubspaceScaleHalf.x + SubspacesScale; vx += SubspacesScale * CmVector.right)
            {
                for (CmVector vy = position - (colliderSubspaceScaleHalf.y + SubspacesScale) * CmVector.up; vy.y <= position.y + colliderSubspaceScaleHalf.y + SubspacesScale; vy += SubspacesScale * CmVector.up)
                {
                    for (CmVector vz = position - (colliderSubspaceScaleHalf.z + SubspacesScale) * CmVector.forward; vz.z <= position.z + colliderSubspaceScaleHalf.z + SubspacesScale; vz += SubspacesScale * CmVector.forward)
                    {
                        CmVector sPosition = new CmVector(vx.x, vy.y, vz.z);
                        CmVector onePosition = GetOnePosition(sPosition);

                        if (!(onePosition.x - SubspacesScaleHalf > position.x + colliderSubspaceScaleHalf.x || onePosition.x + SubspacesScaleHalf < position.x - colliderSubspaceScaleHalf.x ||
                             onePosition.y - SubspacesScaleHalf > position.y + colliderSubspaceScaleHalf.y || onePosition.y + SubspacesScaleHalf < position.y - colliderSubspaceScaleHalf.y ||
                             onePosition.z - SubspacesScaleHalf > position.z + colliderSubspaceScaleHalf.z || onePosition.z + SubspacesScaleHalf < position.z - colliderSubspaceScaleHalf.z
                            ))
                        {
                            if (iCmCollider.IsHitSubspace(SubspacesScale, SubspacesScalePow, onePosition))
                            {
                                CreateSubspace(onePosition, id, subspaces);
                            }
                        }
                    }
                }
            }
        }

        public void Activate()
        {
            IsActive = true;
            CalculateTime = 0;
            KinematicStates = "";
        }
        private System.Action<CmRigidbody> bodyUpdateCallback;

        public void Calculate(System.Action<CmRigidbody> bodyUpdateCallback, bool addKinematicState)
        {
            if(!IsActive)
            {
                return;
            }

            IsActive = false;
            this.bodyUpdateCallback = bodyUpdateCallback;

            ActiveBodies = GetActiveBodies();
            DynamicSubspaces.Clear();
            CreateSubspaces(Timestep, addKinematicState);
            CalculateTime += Timestep;
        }
    
        private Queue<CmRigidbody> GetActiveBodies()
        {
            long tsPow = 10000;
            Queue<CmRigidbody> activeBodies = new Queue<CmRigidbody>(0);
            CmRigidbody needBody = Rigidbodies[0];

            for (int i = 0; i < Rigidbodies.Count; i++)
            {
                CmRigidbody body = Rigidbodies[i];

                if(IsActive)
                {
                    long velocitySqrMagnitude = body.Velocity.SqrMagnitude;
                    if (velocitySqrMagnitude != 0)
                    {
                        long needTsPow = CmMath.Divide(body.collider.RadiusPow, velocitySqrMagnitude);
                        if (tsPow > needTsPow)
                        {
                            tsPow = needTsPow;
                            needBody = body;
                        }
                    }
                }
                if (body.IsActive)
                {
                    IsActive = true;
                    activeBodies.Enqueue(Rigidbodies[i]);
                }
            }
           
            long velocityMagnitude = needBody.Velocity.Magnitude;
            long needTs = maxTS;
            if (velocityMagnitude != 0)
            {
                needTs = CmMath.Clamp(CmMath.Divide(needBody.collider.Radius, velocityMagnitude) / precision, minTS, maxTS);
            }
            Timestep = needTs;
            return activeBodies;
        }
        private void CreateSubspaces(long timestep, bool addKinematicState)
        {
            for (int i = 0; i < Rigidbodies.Count; i++)
            {
                CmRigidbody body = Rigidbodies[i];
                MoveAndCheckBodyIsActive(body, timestep, addKinematicState);
                if (!body.IsKinematic && !body.IsOutOfCube)
                {
                    CreateSubspace(body);
                }
            }
        }

       
        public CmVector GetSubPosition(CmVector bodyPosition, CmVector position, long radius)
        {
            long rX = bodyPosition.x - position.x;
            long rY = bodyPosition.y - position.y;
            long rZ = bodyPosition.z - position.z;

            long deltaPos = SubspacesScaleHalf - radius;

            long deltaPosX = rX >= deltaPos ? 1 : (rX <= -deltaPos ? -1 : 0);
            long deltaPosY = rY >= deltaPos ? 1 : (rY <= -deltaPos ? -1 : 0);
            long deltaPosZ = rZ >= deltaPos ? 1 : (rZ <= -deltaPos ? -1 : 0);
            return new CmVector(SubspacesScale * deltaPosX, SubspacesScale * deltaPosY, SubspacesScale * deltaPosZ);
        }
        private CmVector GetOnePosition(CmVector bodyPosition)
        {
            return (bodyPosition / SubspacesScale) * SubspacesScale;
        }
 
        // Add body to dynamic subspaces
        private void CreateSubspace(CmRigidbody body)
        {
            if (!body.OldPositionIsChecked || body.Position != body.OldPosition)
            {
                CmVector position = GetOnePosition(body.Position);
                CreateDynamicSubspace(position, body);
                CmVector subPosition = GetSubPosition(body.Position, position, body.collider.Radius);
                body.OldPosition = body.Position;

                body.OnePosition = position;
                body.SubPosition = subPosition;

                CreateNearSubspaces(subPosition, position, body);
            }
            else
            {
                CmVector position = body.OnePosition;
                CreateDynamicSubspace(position, body);
                CmVector subPosition = body.SubPosition;

                CreateNearSubspaces(subPosition, position, body);
            }
        }

        private void CreateNearSubspaces(CmVector subPosition, CmVector position, CmRigidbody body)
        {
            if (subPosition.x != 0)
            {
                CreateDynamicSubspaceOne(position, new CmVector(subPosition.x, 0, 0), body);
                if (subPosition.y != 0)
                {
                    CreateDynamicSubspaceOne(position, new CmVector(0, subPosition.y, 0), body);
                    CreateDynamicSubspaceOne(position, new CmVector(subPosition.x, subPosition.y, 0), body);
                    if (subPosition.z != 0)
                    {
                        CreateDynamicSubspaceOne(position, new CmVector(0, 0, subPosition.z), body);
                        CreateDynamicSubspaceOne(position, new CmVector(subPosition.x, 0, subPosition.z), body);
                        CreateDynamicSubspaceOne(position, new CmVector(0, subPosition.y, subPosition.z), body);
                        CreateDynamicSubspaceOne(position, new CmVector(subPosition.x, subPosition.y, subPosition.z), body);
                    }
                }
                else if (subPosition.z != 0)
                {
                    CreateDynamicSubspaceOne(position, new CmVector(0, 0, subPosition.z), body);
                    CreateDynamicSubspaceOne(position, new CmVector(subPosition.x, 0, subPosition.z), body);
                }
            }
            else
            {
                if (subPosition.y != 0)
                {
                    CreateDynamicSubspaceOne(position, new CmVector(0, subPosition.y, 0), body);
                    if (subPosition.z != 0)
                    {
                        CreateDynamicSubspaceOne(position, new CmVector(0, 0, subPosition.z), body);
                        CreateDynamicSubspaceOne(position, new CmVector(0, subPosition.y, subPosition.z), body);
                    }
                }
                else if (subPosition.z != 0)
                {
                    CreateDynamicSubspaceOne(position, new CmVector(0, 0, subPosition.z), body);
                }
            }
        }

        private void CreateDynamicSubspaceOne(CmVector position, CmVector subPosition, CmRigidbody body)
        {
            CreateDynamicSubspace(position + subPosition, body);
        }
        private void CreateDynamicSubspace(CmVector position, CmRigidbody body)
        {
            if (!CmCollisionManager.SphereIsHitSubspace(body.Position, body.collider.RadiusPow, SubspacesScaleHalf, position))
            {
                return;
            }

            if (body.IsActive)
            {
                if(!body.IsOutOfCube)
                {
                    body.CalculateOutOfCube(SpaceCube);
                    if(body.IsOutOfCube)
                    {
                        KinematicStates += body.ToKinematicState(CalculateTime);
                        bodyUpdateCallback?.Invoke(body);
                    }
                }

                if(!body.IsOutOfCube && !body.IsKinematic)
                {
                    Queue<int> kinematicSpacesId = (KinematicSubspaces == null ||
                        !KinematicSubspaces.ContainsKey(position)) ? null : KinematicSubspaces[position];

                    if (kinematicSpacesId != null)
                    {
                        foreach (int kinematicSpaceId in kinematicSpacesId)
                        {
                            body.CalculateHit(Triggers[kinematicSpaceId]);
                            if (body.IsKinematic)
                            {
                                KinematicStates += body.ToKinematicState(CalculateTime);
                                bodyUpdateCallback?.Invoke(body);
                                break;
                            }
                        }
                    }
                }
            }

            if (!DynamicSubspaces.ContainsKey(position))
            {
                Queue<int> bodiesId = new Queue<int>(0);
                bodiesId.Enqueue(body.Id);
                DynamicSubspaces.Add(position, bodiesId);
            }
            else 
            {
                Queue<int> bodiesId = DynamicSubspaces[position];
                foreach (int bodyId in bodiesId)
                {
                    CmRigidbody cmRigidbody = Rigidbodies[bodyId];

                    if (body.IsActive)
                    {
                        body.CalculateHit(Timestep, cmRigidbody, ()=>
                        {
                            KinematicStates += body.ToKinematicState(CalculateTime);
                        }, ()=>
                        {
                            KinematicStates += body.ToKinematicState(CalculateTime);
                        });
                    }
                    else if (cmRigidbody.IsActive)
                    {
                        cmRigidbody.CalculateHit(Timestep, body, () =>
                        {
                            KinematicStates += cmRigidbody.ToKinematicState(CalculateTime);
                        }, () =>
                        {
                            KinematicStates += cmRigidbody.ToKinematicState(CalculateTime);
                        });
                    }
                }
                bodiesId.Enqueue(body.Id);
            }

            if (body.IsActive)
            {
                Queue<int> collidersId = (StaticSubspaces == null || !StaticSubspaces.ContainsKey(position)) ? null : StaticSubspaces[position];
               
                if (collidersId != null)
                {
                    foreach (int colliderId in collidersId)
                    {
                        body.CalculateHit(Timestep, Colliders[colliderId], () =>
                        {
                            KinematicStates += body.ToKinematicState(CalculateTime);
                        }, () =>
                        {
                            KinematicStates += body.ToKinematicState(CalculateTime);
                        });
                    }
                }
            }
        }

        private void CreateSubspace(CmVector position, int curveId, Dictionary<CmVector, Queue<int>> subspaces)
        {
            if (!subspaces.ContainsKey(position))
            {
                Queue<int> curveIds = new Queue<int>(0);
                curveIds.Enqueue(curveId);
                subspaces.Add(position, curveIds);
            }
            else
            {
                subspaces[position].Enqueue(curveId);
            }

        }

        private void AddKinematicState(CmRigidbody body, long timestep)
        {
            CmVector bodyDeltaVelocity = body.Velocity - body.oldVelocity;
            CmVector bodyDeltaAngularVelocity = body.AngularVelocity - body.oldAngularVelocity;
            body.oldVelocity = body.Velocity;
            body.oldAngularVelocity = body.AngularVelocity;
     
            if (CmVector.MaxXYZ(body.DeltaVelocity, bodyDeltaVelocity) >= 1000 ||
             CmVector.MaxXYZ(body.DeltaAngularVelocity, bodyDeltaAngularVelocity) >= 2500)
            {
                body.DeltaVelocity = bodyDeltaVelocity;
                body.DeltaAngularVelocity = bodyDeltaAngularVelocity;
                KinematicStates += body.ToKinematicState(CalculateTime);
                CmRigidbody.ballsSendCount++;

            }

            CmRigidbody.ballsUpdateCount++;
        }
        
        private void MoveAndCheckBodyIsActive(CmRigidbody body, long timestep, bool addKinematicState)
        {
            if (!body.IsKinematic && !body.IsOutOfCube)
            {
                body.MoveAndCheckIsActive(timestep);

                if (body.IsActive)
                {
                    if (addKinematicState)
                    {
                        AddKinematicState(body, timestep);
                    }
                    CmVector delta = CmVector.Multiply(body.Velocity, timestep);
                    body.collider.Position += delta;
                    body.hitColliders.Clear();
                }
                else if (!body.IsSleeping)
                {
                    body.IsSleeping = true;
                    if (addKinematicState)
                    {
                        AddKinematicState(body, timestep);
                    }
                }
                body.hitBodies.Clear();
                body.HitInfo = new CmHitInfo();

                bodyUpdateCallback?.Invoke(body);
            }
        }

        public void SetBodyPosition(int bodyId, CmVector position)
        {
            Rigidbodies[bodyId].collider.Position = position;
        }

        public void PutBallOnPlane(int bodyId, int planeId, int numberOfChecks, System.Action<CmRigidbody> bodyUpdateCallback)
        {
            CmPlaneCollider plane = (CmPlaneCollider)Colliders[planeId];
            CmRigidbody moveBody = Rigidbodies[bodyId];
            moveBody.IsKinematic = false;
            moveBody.IsOutOfCube = false;
            CmVector deltaY = CmVector.Multiply(plane.up, moveBody.collider.Radius);

            CmVector currentPoint = plane.position + deltaY;
            CmVector delta = CmVector.zero;
            bool puted = false;
            long directionX = 1;
            long directionZ = 0;
            bool andCheck = false;
            long displacement = numberOfChecks * 3 * moveBody.collider.Radius;

            while (!puted && !andCheck)
            {
                currentPoint = delta + plane.position + deltaY;
                if (delta.x > displacement)
                {
                    delta = CmVector.zero;
                    directionX = -1;
                }
                else if (delta.x < -displacement)
                {
                    delta = CmVector.zero;
                    directionX = 0;
                    directionZ = 1;
                }
                else if (delta.z > displacement)
                {
                    delta = CmVector.zero;
                    directionX = 0;
                    directionZ = -1;
                }
                else if (delta.z < -displacement)
                {
                    andCheck = true;
                }

                delta += CmVector.Multiply(plane.right, 3 * directionX * moveBody.collider.Radius) +
                         CmVector.Multiply(plane.forward, 3 * directionZ * moveBody.collider.Radius);

                CmVector onePosition0 = GetOnePosition(currentPoint);
                CmVector onePosition1 = GetOnePosition(currentPoint + CmVector.Multiply(plane.right, moveBody.collider.Radius));
                CmVector onePosition2 = GetOnePosition(currentPoint - CmVector.Multiply(plane.right, moveBody.collider.Radius));
                CmVector onePosition3 = GetOnePosition(currentPoint + CmVector.Multiply(plane.forward, moveBody.collider.Radius));
                CmVector onePosition4 = GetOnePosition(currentPoint - CmVector.Multiply(plane.forward, moveBody.collider.Radius));
                if (!DynamicSubspaces.ContainsKey(onePosition0) &&
                    !DynamicSubspaces.ContainsKey(onePosition1) &&
                    !DynamicSubspaces.ContainsKey(onePosition2) &&
                    !DynamicSubspaces.ContainsKey(onePosition3) &&
                    !DynamicSubspaces.ContainsKey(onePosition4))
                {
                    moveBody.collider.Position = currentPoint;
                    puted = true;
                }

            }
            if (!puted)
            {
                currentPoint = plane.position + deltaY;
                moveBody.collider.Position = currentPoint;
            }

            bodyUpdateCallback?.Invoke(moveBody);
        }
        //public bool SphereCast(int bodiId, CmVector position, CmVector force, out CmHitInfo hitInfo, long maxDistance, long maxTime)
        //{
        //    CmSpaceState savedState = GetState();
        //    SetBodyPosition(bodiId, position);
        //    bool isCast = BodySphereCast(bodiId, force, out hitInfo, maxDistance, maxTime);
        //    SetState(savedState, null);
        //    return isCast;
        //}
        public bool SphereCast(int bodiId, CmVector force, out CmHitInfo hitInfo, long maxDistance, long maxTime)
        {
            CmSpaceState savedState = GetState();
            bool isCast = BodySphereCast(bodiId, force, out hitInfo, maxDistance, maxTime);
            SetState(savedState, null);
            return isCast;
        }

        private bool BodySphereCast(int bodiId, CmVector force, out CmHitInfo hitInfo, long maxDistance, long maxTime)
        {
            CmHitInfo cmHitInfo = new CmHitInfo();
            CmRigidbody hitBody = Rigidbodies[bodiId];
            hitBody.AddImpulse(force, hitBody.collider.Position, CmForceMode.Impulse);
            long time = 0;
            long distance = 0;
            CmVector hitBodyPosition = hitBody.Position;
            Activate();
            while (!hitBody.IsKinematic && IsActive && time < maxTime && distance < maxDistance && cmHitInfo.Collider == null)
            {
                Calculate(null, false);
                if (hitBody.HitInfo.Collider != null && hitBody.HitInfo.Collider.GetType() != typeof(CmPlaneCollider))
                {
                    cmHitInfo = hitBody.HitInfo;
                }
                time += Timestep;
                distance += (hitBody.Position - hitBodyPosition).Magnitude;
                hitBodyPosition = hitBody.Position;
            }
            hitInfo = cmHitInfo;
            hitBody.HitInfo = new CmHitInfo();
            return cmHitInfo.Collider != null;
        }

        public bool SphereCast(CmSpace space, CmVector point, CmVector direction, long radius, out CmHitInfo hitInfo, long maxDistance, CmVector deltaVector)
        {
            long distance = 0;
            CmVector currentPoint = point;
            CmVector onePosition = GetOnePosition(currentPoint);
            CmVector subPosition = GetSubPosition(currentPoint, onePosition, radius);
            long delta = CmMath.ClampMin(radius / 4, 1);

            while (distance <= maxDistance)
            {
                onePosition = GetOnePosition(currentPoint);

                if(IsHitSphere(currentPoint, onePosition, direction, space, radius, out hitInfo))
                {
                    return true;
                }

                subPosition = GetSubPosition(currentPoint, onePosition, radius);

                if (subPosition != CmVector.zero)
                {
                    if (subPosition.x != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(subPosition.x, 0, 0), direction, space, radius, out hitInfo))
                        return true;
                    if (subPosition.y != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(0, subPosition.y, 0), direction, space, radius, out hitInfo))
                        return true;
                    if (subPosition.z != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(0, 0, subPosition.z), direction, space, radius, out hitInfo))
                        return true;

                    if (subPosition.x != 0 && subPosition.y != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(subPosition.x, subPosition.y, 0), direction, space, radius, out hitInfo))
                        return true;
                    if (subPosition.x != 0 && subPosition.z != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(subPosition.x, 0, subPosition.z), direction, space, radius, out hitInfo))
                        return true;
                    if (subPosition.y != 0 && subPosition.z != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(0, subPosition.y, subPosition.z), direction, space, radius, out hitInfo))
                        return true;

                    if (subPosition.x != 0 && subPosition.y != 0 && subPosition.z != 0 && IsHitSphere(currentPoint, onePosition + new CmVector(subPosition.x, subPosition.y, subPosition.z), direction, space, radius, out hitInfo))
                        return true;

                }

                distance += delta;
                currentPoint += deltaVector;
            }
            hitInfo = new CmHitInfo();
            return false;
        }

        private bool IsHitSphere(CmVector currentPoint, CmVector onePosition, CmVector direction, CmSpace space, long radius, out CmHitInfo hitInfo)
        {
            if (space.DynamicSubspaces.ContainsKey(onePosition))
            {
                Queue<int> bodies = space.DynamicSubspaces[onePosition];
                foreach (var item in bodies)
                {
                    CmRigidbody body = space.Rigidbodies[item];
                    if (body.collider.IsHitSphere(currentPoint, radius, out hitInfo) && CmVector.Dot(hitInfo.Normal, direction) < 0)
                    {
                        return true;
                    }
                }
            }
            if (space.StaticSubspaces.ContainsKey(onePosition))
            {
                Queue<int> colliders = space.StaticSubspaces[onePosition];
                foreach (var item in colliders)
                {
                    ICmCollider collider = space.Colliders[item];
                    if (collider.IsHitSphere(currentPoint, radius, out hitInfo))
                    {
                        return true;
                    }
                }
            }
            hitInfo = new CmHitInfo();
            return false;
        }
    }
}
