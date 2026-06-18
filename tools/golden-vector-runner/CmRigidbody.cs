using System.Collections.Generic;

namespace CalculableMechanics
{
    internal enum CmForceMode
    {
        Force,
        Impulse
    };

    public enum CmBodyMovingType
    {
        Rolling,
        Sliding,
        Twisting
    };

    /// <summary>
    /// Control of an object's position through physics simulation.
    /// </summary>
    [System.Serializable]
    public class CmRigidbody
    {
        public int Id { get; set; }
        public int InstanceId { get; set; }
        public long mass;

        /// <summary>
        /// Gets or sets the local centre of mass.
        /// </summary>
        public CmVector centreOfMass;
        public CmVector MassPosition { get { return collider.Position + (centreOfMass.x * collider.Right + centreOfMass.y * collider.Up + centreOfMass.z * collider.Forward) / CmMath.defoultMultiplier; } }

        public CmVector Velocity { get; internal set; }
        public CmVector AngularVelocity { get; set; }
        public CmHitInfo HitInfo { get; internal set; }

        public System.Action<CmVector, CmHitInfo> OnHit;
        public System.Action<CmVector, CmVector, CmBodyMovingType> OnMoving;

        internal const long minSqrVelocity = 100;
        public const long MaxVelocity = 65000;
        internal CmVector oldVelocity;
        internal CmVector oldAngularVelocity;

        [System.NonSerialized] internal ICmCollider collider;
        [System.NonSerialized] internal Queue<int> hitColliders = new Queue<int>(0);
        [System.NonSerialized] internal Queue<int> hitBodies = new Queue<int>(0);
        private int checkCount;

        public bool IsOutOfCube;
        public bool IsKinematic;
        public int KinematicTriggerId { get; set; } = -1;

        public static long ballsUpdateCount;
        public static long ballsSendCount;
        
        internal CmVector DeltaVelocity { get; set; }
        internal CmVector DeltaAngularVelocity { get; set; }
        internal bool OldPositionIsChecked { get; private set; } = false;

        private CmVector oldPosition;
        internal CmVector OldPosition
        {
            get
            {
                return oldPosition;
            }
            set
            {
                OldPositionIsChecked = true;
                oldPosition = value;
            }
        }
        internal CmVector SubPosition { get; set; }
        internal CmVector OnePosition { get; set; }

        private bool _isActive;

        public bool IsActive
        {
            get { return _isActive; }
            set
            {
                if (value == true)
                {
                    checkCount = 0;
                    _isActive = true;
                }
                else
                {
                    _isActive = false;
                    Velocity = CmVector.zero;
                    AngularVelocity = CmVector.zero;
                }
            }
        }
        private bool _isSleeping;
        public bool IsSleeping
        {
            get { return _isSleeping; }
            set
            {
                if (value == true)
                {
                    _isSleeping = true;
                    Velocity = CmVector.zero;
                    AngularVelocity = CmVector.zero;
                }
                else
                {
                    _isSleeping = false;
                }
            }
        }

        internal void CheckIsActive(int cCount)
        {
            if (!IsActive)
            {
                return;
            }
            if (Velocity.SqrMagnitude <= minSqrVelocity && AngularVelocity.SqrMagnitude <= minSqrVelocity)
            {
                if (checkCount < cCount)
                {
                    checkCount++;
                }
                else
                {
                    checkCount = 0;
                    IsActive = false;
                }
            }
            else
            {
                checkCount = 0;
            }
        }
        internal CmVector Position
        {
            get { return collider.Position; }
        }

        public void Init()
        {
            _isActive = true;
            _isSleeping = false;
            checkCount = 0;
            hitColliders.Clear();
            hitBodies.Clear();
            HitInfo = new CmHitInfo();
        }

        public CmKinematicState ToKinematicState(long time)
        {
            return new CmKinematicState(Id, time, IsActive, Position.ToCmSimpleVector(), Velocity.ToCmSimpleVector(), AngularVelocity.ToCmSimpleVector(), IsKinematic, KinematicTriggerId, IsOutOfCube);
        }

        public void SetState(string stringState)
        {
            SetState(new CmRigidbodyState(stringState));
        }
        public void SetState(CmRigidbodyState state)
        {
            IsActive = state.IsActive;
            IsKinematic = state.IsKinematic;
            KinematicTriggerId = state.KinematicTriggerId;
            IsOutOfCube = state.IsOutOfCube;
            collider.Position = state.Position;
            collider.Right = state.Right;
            collider.Up = state.Up;
            collider.Forward = state.Forward;
            Velocity = state.Velocity;
            AngularVelocity = state.AngularVelocity;
            FirstHitDirection = state.FirstHitDirection;
        }

        /// <summary>
        /// Add force to the rigidbody.
        /// </summary>
        internal void AddImpulse(CmVector force, CmVector pos, CmForceMode mode, long timestep = 0)
        {
            if (IsKinematic || force == CmVector.zero)
            {
                return;
            }
            _isActive = true;
            CmVector forceRadius = pos - MassPosition;
            CmVector deltaVelocity = CmVector.Divide(force, mass);

            switch (mode)
            {
                case CmForceMode.Force:
                    Velocity += CmVector.Multiply(deltaVelocity, timestep);
                    break;
                case CmForceMode.Impulse:
                    Velocity += deltaVelocity;
                    break;
            }
            if (forceRadius != CmVector.zero)
            {
                CmVector torque = CmVector.Cross(-force, forceRadius);
                AddTorque(torque, mode, timestep);
            }
        }

        /// <summary>
        /// Add torque to the rigidbody.
        /// </summary>
        internal void AddTorque(CmVector torque, CmForceMode mode, long timestep = 0)
        {
            if (IsKinematic || torque == CmVector.zero)
            {
                return;
            }
            _isActive = true;
            CmVector deltaAngularVelocity = CmVector.Divide(CmVector.Divide(torque, mass), collider.GetMomentOfInertia(centreOfMass, torque.Normalized));
            switch (mode)
            {
                case CmForceMode.Force:
                    AngularVelocity += CmVector.Multiply(deltaAngularVelocity, timestep);
                    break;
                case CmForceMode.Impulse:
                    AngularVelocity += deltaAngularVelocity;
                    break;
            }
        }


        internal void MoveAndCheckIsActive(long timestep)
        {
            if (hitColliders == null || hitColliders.Count == 0)
            {
                if (IsActive)
                {
                    Velocity += CmVector.Multiply(CmVector.gravity, timestep);
                }
            }
            else
            {
                CheckIsActive(2);
            }
            if ((hitBodies != null && hitBodies.Count > 0))
            {
                CheckIsActive(2);
            }
        }

        internal CmVector FirstHitDirection { get; set; }

        internal void CalculateHit(long timestep, CmRigidbody body2, System.Action beforeHit, System.Action afterHit)
        {
            if (!hitBodies.Contains(body2.Id) && collider.IsHit(body2.collider, out CmHitInfo hitInfo))
            {
                hitBodies.Enqueue(body2.Id);
                body2.hitBodies.Enqueue(Id);

                CmVector velocyty1 = Velocity - body2.Velocity;

                CmVector mp = MassPosition;
                CmVector mp2 = body2.MassPosition;
                CmVector hitRelativeVelocity = Velocity - body2.Velocity + CmVector.Cross(AngularVelocity, hitInfo.Point - mp) - CmVector.Cross(body2.AngularVelocity, hitInfo.Point - mp2);

                if (CmVector.Dot(hitRelativeVelocity, hitInfo.Normal) < 0)
                {
                    CmVector hitNormal = hitInfo.Normal.Normalized;
                    beforeHit();
                    //long bounciness = GetBounciness(collider, body2.collider);
                    long bounciness = CmMath.SqrtSave(CmMath.Multiply(collider.Material.bounciness, body2.collider.Material.bounciness));
                    CmVector velocityT = CmVector.ProjectOnPlane(hitRelativeVelocity, hitNormal);
                    CmVector velocityTangents = velocityT.Normalized;
                    long velocityN = -CmVector.Dot(hitRelativeVelocity, hitNormal);
                    //long staticFriction = GetStaticFriction(collider, body2.collider);
                    long staticFriction = CmMath.SqrtSave(CmMath.Multiply(collider.Material.staticFriction, body2.collider.Material.staticFriction));
                    CmVector vR = CmVector.Multiply(CmVector.Multiply(velocityTangents, -staticFriction) + hitNormal, -velocityN);

                    //CmVector forceDirection = vR.Normalized;
                    //long r1 = CmVector.PointSqrDistance(mp, hitInfo.Point, forceDirection);
                    //long r2 = CmVector.PointSqrDistance(mp2, hitInfo.Point, forceDirection);
                    //long i1 = collider.MomentOfInertia(Position, CmVector.zero /*CmVector.Cross(forceDirection, hitNormal).Normalized*/);
                    //long i2 = collider.MomentOfInertia(body2.Position, CmVector.zero);
                    //long p = mass + body2.mass + CmValue.Multiply(CmValue.Multiply(mass, body2.mass), ((r1 / i1) + (r2 / i2)));

                    CmVector forceRadius = hitInfo.Point - mp;
                    CmVector impulse = -(bounciness * vR) / CmMath.defoultMultiplier;// p;
                    CmVector torque = CmVector.Cross(-impulse, forceRadius);
                    CmVector angularImpulse = CmVector.Divide(torque, collider.GetMomentOfInertia(centreOfMass, CmVector.zero));// torque.Normalized);

                    vR = CmVector.Project(Velocity - body2.Velocity, hitNormal);
                    impulse = -vR;

                    AngularVelocity += angularImpulse;
                    if (FirstHitDirection != CmVector.zero)
                    {
                        CmVector impulse2 = CmVector.Project(impulse, FirstHitDirection);
                        long dotChack = (10 * CmVector.Dot(impulse.Normalized, impulse2.Normalized)) / CmMath.defoultMultiplier;
                        if (dotChack >= 9)
                        {
                            Velocity += impulse2;
                        }
                        else
                        {
                            Velocity += impulse;
                        }
                        FirstHitDirection = CmVector.zero;
                    }
                    else
                    {
                        Velocity += impulse;
                    }
                    

                    body2.AngularVelocity -= angularImpulse;

                    if (body2.FirstHitDirection != CmVector.zero)
                    {
                        CmVector impulse2 = CmVector.Project(impulse, body2.FirstHitDirection);
                        long dotChack = (10 * CmVector.Dot(impulse.Normalized, impulse2.Normalized)) / CmMath.defoultMultiplier;
                        if(dotChack >= 9)
                        {
                            body2.Velocity -= impulse2;
                        }
                        else
                        {
                            body2.Velocity -= impulse;
                        }
                        body2.FirstHitDirection = CmVector.zero;
                    }
                    else
                    {
                        body2.Velocity -= impulse;
                    }

                    body2.IsActive = true;
                    body2.IsSleeping = false;
                    if (HitInfo.Collider == default(ICmCollider))
                    {
                        HitInfo = new CmHitInfo(true, hitInfo.Point, hitInfo.Normal, body2.collider);
                    }
                    if (body2.HitInfo.Collider == default(ICmCollider))
                    {
                        body2.HitInfo = new CmHitInfo(true, hitInfo.Point, -hitInfo.Normal, collider);
                    }
                    OnHit?.Invoke(velocyty1, HitInfo);
                    body2.OnHit?.Invoke(velocyty1, body2.HitInfo);
                    afterHit();
                }
            }
        }
        internal void CalculateHit(long timestep, ICmCollider collider2, System.Action beforeHit, System.Action afterHit)
        {
            if (!hitColliders.Contains(collider2.Id) && collider.IsHit(collider2, out CmHitInfo hitInfo))
            {
                CmVector velocyty1 = Velocity;

                hitColliders.Enqueue(collider2.Id);
                CmVector mp = MassPosition;
                CmVector hitRadius = hitInfo.Point - mp;
                CmVector hitRelativeVelocity = Velocity + CmVector.Cross(AngularVelocity, hitRadius);

                if (collider2 is CmPlaneCollider)
                {
                    CalculatePlaneColliderHit(timestep, collider2, hitRelativeVelocity, hitInfo, hitRadius);
                }
                else if (CmVector.Dot(Velocity, hitInfo.Normal) <= 0)
                {
                    if (collider2 is CmLineCollider)
                    {
                        beforeHit();

                        CalculateOtherColliderHit(mp, collider2, Velocity, hitRelativeVelocity, hitInfo, hitRadius);
                        if (HitInfo.Collider == default(ICmCollider))
                        {
                            HitInfo = new CmHitInfo(hitInfo.Point, hitInfo.Normal, collider2);
                        }
                        OnHit?.Invoke(velocyty1, HitInfo);
                        afterHit();
                    }
                    else if (collider2 is CmSphereCollider)
                    {
                        if (CmVector.Dot(Velocity, hitInfo.Normal) < 0)
                        {
                            beforeHit();

                            CalculateHit(mp, Velocity, hitInfo, (CmSphereCollider)collider2);
                            if (HitInfo.Collider == default(ICmCollider))
                            {
                                HitInfo = new CmHitInfo(hitInfo.Point, hitInfo.Normal, collider2);
                            }
                            OnHit?.Invoke(velocyty1, HitInfo);
                            afterHit();
                        }
                    }
                }
            }
        }

        internal void CalculateHit(CmVector mp, CmVector velocity, CmHitInfo hitInfo, CmSphereCollider sphereCollider2)
        {
            CmVector velocyty1 = Velocity;

            long bounciness = CmMath.SqrtSave(CmMath.Multiply(collider.Material.bounciness, sphereCollider2.Material.bounciness));
            long velocityN = -CmVector.Dot(velocity, hitInfo.Normal);
            CmVector vR = CmVector.Multiply(hitInfo.Normal, -velocityN);

            CmVector impulse = -(bounciness * vR) / CmMath.defoultMultiplier;// p;
            Velocity += impulse;
            collider.Position = hitInfo.Point + (collider.Radius * hitInfo.Normal) / CmMath.defoultMultiplier;
            //Velocity = -(bounciness * CmVector.Project(Velocity, hitInfo.Normal)) / CmMath.defoultMultiplier;

            CmVector forceRadius = hitInfo.Point - mp;
            CmVector torque = CmVector.Cross(-impulse, forceRadius);
            CmVector angularImpulse = CmVector.Divide(torque, collider.GetMomentOfInertia(centreOfMass, CmVector.zero));// torque.Normalized);
            AngularVelocity += angularImpulse;

            if (HitInfo.Collider == default(ICmCollider))
            {
                HitInfo = new CmHitInfo(hitInfo.Point, hitInfo.Normal, sphereCollider2);
            }
 
            OnHit?.Invoke(velocyty1, HitInfo);
        }


        public void CalculateHit(CmKinematicTrigger trigger)
        {
            if (!IsKinematic && collider.IsHit(trigger, out CmHitInfo hitInfo))
            {
                IsKinematic = true;
                IsActive = false;
                KinematicTriggerId = trigger.Id;
            }
        }

        public void CalculateOutOfCube(CmSpaceCube spaceCube)
        {
            if (!IsOutOfCube && CmCollisionManager.IsOutOfSpaceCube(collider, spaceCube))
            {
                IsOutOfCube = true;
                IsActive = false;
            }
        }

        private void CalculateOtherColliderHit(CmVector mp, ICmCollider collider2, CmVector velocity, CmVector hitRelativeVelocity, CmHitInfo hitInfo, CmVector hitRadius)
        {
            long bounciness = CmMath.SqrtSave(CmMath.Multiply(collider.Material.bounciness, collider2.Material.bounciness));
            long velocityT = -CmVector.Dot(hitRelativeVelocity, hitInfo.Collider.Right);

            //CmVector velocityT = CmVector.ProjectOnPlane(hitRelativeVelocity, hitInfo.Normal);
            //CmVector velocityTangents = velocityT.Normalized;
            long velocityN = -CmVector.Dot(hitRelativeVelocity, hitInfo.Normal);
  
            long tFactor = velocityN == 0? 0 :(velocityT * CmMath.defoultMultiplier) / velocityN;

            long staticFriction = CmMath.SqrtSave(CmMath.Multiply(collider.Material.staticFriction, collider2.Material.staticFriction));
            CmVector direction = (((staticFriction * tFactor * hitInfo.Collider.Right) / (CmMath.defoultMultiplier * CmMath.defoultMultiplier)) + hitInfo.Normal).Normalized;
            //CmVector direction = ((-(staticFriction * velocityTangents) / CmValue.defoultMultiplier) + hitInfo.Normal).Normalized;
            CmVector vR = -(velocityN * direction) / CmMath.defoultMultiplier;
            //CmVector forceDirection = vR.Normalized;
            //long r1 = CmVector.PointSqrDistance(mp, hitInfo.Point, forceDirection);
            //long i1 = collider.GetMomentOfInertia(Position, CmVector.zero); 

            //CmVector impulse = -((bounciness + CmValue.defoultMultiplier) * vR * i1) / ((i1 + r1) * CmValue.defoultMultiplier);
            CmVector impulse = -((bounciness + CmMath.defoultMultiplier) * vR ) / CmMath.defoultMultiplier;

            impulse = ClampMin(impulse, -CmVector.Dot(velocity, hitInfo.Normal), hitInfo.Normal);

            CmVector torque = CmVector.Cross(-impulse, hitRadius);
            CmVector angularImpulse = (CmMath.defoultMultiplier * torque) / collider.GetMomentOfInertia(centreOfMass, CmVector.zero);// torque.Normalized);
            Velocity += impulse;
            AngularVelocity += angularImpulse;
            //angularVelocity = -(bounciness * angularVelocity) / CmValue.defoultMultiplier;
        }

        private CmVector ClampMin(CmVector vector, long min, CmVector normal)
        {
            CmVector project = CmVector.Project(vector, normal);
            CmVector delta = vector - project;
            project = CmVector.ClampMagnitude(project, (15 * min) / 10, long.MaxValue);
            return project + delta;
        }


        private void CalculatePlaneColliderHit(long timestep, ICmCollider planeCollider, CmVector hitRelativeVelocity, CmHitInfo hitInfo, CmVector hitRadius)
        {
            CmVector velocyty1 = Velocity;

            //long bounciness = GetBounciness(collider, planeCollider);
            long bounciness = CmMath.SqrtSave(CmMath.Multiply(collider.Material.bounciness, planeCollider.Material.bounciness));
            CmVector velocityT = CmVector.ProjectOnPlane(hitRelativeVelocity, hitInfo.Normal);
            CmVector velocityTangents = velocityT.Normalized;
            long velocityN = -CmVector.Dot(hitRelativeVelocity, hitInfo.Normal);
            long gravityN = -CmVector.Dot(CmVector.gravity, hitInfo.Normal);

            if ((bounciness + CmMath.defoultMultiplier) * velocityN > gravityN * timestep)
                //if (CmMath.Pow((bounciness + CmMath.defoultMultiplier) * velocityN, 2) > minSqrVelocity / 10)
            {
                //long staticFriction = GetStaticFriction(collider, planeCollider);
                long staticFriction = CmMath.SqrtSave(CmMath.Multiply(collider.Material.staticFriction, planeCollider.Material.staticFriction));
                CmVector vR = -(velocityN * (((-staticFriction * velocityTangents) / CmMath.defoultMultiplier) + hitInfo.Normal)) / CmMath.defoultMultiplier;
                CmVector forceDirection = vR.Normalized;
                CmVector impulse = -((bounciness + CmMath.defoultMultiplier) * vR) / CmMath.defoultMultiplier;// p;
                CmVector torque = CmVector.Cross(-impulse, hitRadius);
                CmVector angularImpulse = (CmMath.defoultMultiplier * torque) / collider.GetMomentOfInertia(centreOfMass, CmVector.zero);// torque.Normalized);
                Velocity += impulse;
                AngularVelocity += angularImpulse;

                HitInfo = new CmHitInfo(hitInfo.Point, hitInfo.Normal, planeCollider);
                OnHit?.Invoke(velocyty1, HitInfo);
            }
            else
            {
                Velocity = CmVector.ProjectOnPlane(Velocity, hitInfo.Normal);
                CmVector gravityT = CmVector.ProjectOnPlane(CmVector.gravity, hitInfo.Normal);
                if (velocityT.SqrMagnitude > minSqrVelocity)
                {
                    CmVector forceT = (-gravityN * velocityTangents) / CmMath.defoultMultiplier;
                    //long dynamicFriction = GetDynamicFriction(collider, planeCollider);
                    long dynamicFriction = CmMath.SqrtSave(CmMath.Multiply(collider.Material.dynamicFriction, planeCollider.Material.dynamicFriction));
                    CmVector dynamicFrictionForce = (forceT * dynamicFriction) / CmMath.defoultMultiplier;
                    CmVector deltaVelocity = dynamicFrictionForce + gravityT;
                    CmVector torqueT = CmVector.Cross(-dynamicFrictionForce, hitRadius);
                    CmVector deltaAngularVelocity = (CmMath.defoultMultiplier * torqueT) / collider.GetMomentOfInertia(centreOfMass, CmVector.zero);
                    if (dynamicFrictionForce != CmVector.zero)
                    {
                        Velocity += (timestep * deltaVelocity) / CmMath.defoultMultiplier;
                        AngularVelocity += (timestep * deltaAngularVelocity) / CmMath.defoultMultiplier;
                        OnMoving?.Invoke(Velocity, AngularVelocity, CmBodyMovingType.Sliding);
                    }
                    else
                    {
                        Velocity = -CmVector.Cross(AngularVelocity, hitRadius);
                        OnMoving?.Invoke(Velocity, AngularVelocity, CmBodyMovingType.Rolling);
                    }                    
                }
                else
                {
                    CmVector forceT = (-gravityN * Velocity.Normalized) / CmMath.defoultMultiplier;
                    long rollingFriction = collider.Material.rollingFriction;
                    CmVector rollingFrictionForce = (forceT * rollingFriction) / CmMath.defoultMultiplier;
                    CmVector deltaVelocity = rollingFrictionForce + gravityT;
                   
                    CmVector torqueT = CmVector.Cross(-rollingFrictionForce, hitRadius);
                    CmVector deltaAngularVelocity = (-CmMath.defoultMultiplier * torqueT) / collider.GetMomentOfInertia(centreOfMass, CmVector.zero);
      
                    if (deltaVelocity.SqrMagnitude < Velocity.SqrMagnitude)
                    {
                        AngularVelocity += (timestep * deltaAngularVelocity) / CmMath.defoultMultiplier;
                        Velocity = -CmVector.Cross(AngularVelocity, hitRadius);
                        OnMoving?.Invoke(Velocity, AngularVelocity, CmBodyMovingType.Rolling);
                    }
                    else
                    {
                        Velocity = CmVector.zero;
                        AngularVelocity = CmVector.Project(AngularVelocity, hitInfo.Normal);
                        OnMoving?.Invoke(Velocity, AngularVelocity, CmBodyMovingType.Twisting);
                    }
                }

                long twistingFriction = CmMath.SqrtSave(CmMath.Multiply(collider.Material.twistingFriction, planeCollider.Material.twistingFriction));
                long deltaTwisting = CmMath.Multiply(twistingFriction, timestep);
               
                CmVector twisting = CmVector.Project(AngularVelocity, hitInfo.Normal);

                if (CmMath.Pow(deltaTwisting, 2) <= twisting.SqrMagnitude)
                {
                    AngularVelocity -= (deltaTwisting * twisting.Normalized) / CmMath.defoultMultiplier;
                }
                else
                {
                    AngularVelocity = CmVector.ProjectOnPlane(AngularVelocity, hitInfo.Normal);
                }
            }
            collider.Position = hitInfo.Point + (collider.Radius * hitInfo.Normal) / CmMath.defoultMultiplier;
        }
    }
}
