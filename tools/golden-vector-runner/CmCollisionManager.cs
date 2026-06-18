namespace CalculableMechanics
{
    /// <summary>
    /// A Collision manager of physical objects.
    /// </summary>
    internal struct CmCollisionManager
    {
        internal static bool IsOutOfSpaceCube(ICmCollider collider, CmSpaceCube spaceCube)
        {
            long x = CmMath.ClampMin(CmMath.Abs(collider.Position.x - spaceCube.position.x) - spaceCube.scale.x / 2, 0);
            long y = CmMath.ClampMin(CmMath.Abs(collider.Position.y - spaceCube.position.y) - spaceCube.scale.y / 2, 0);
            long z = CmMath.ClampMin(CmMath.Abs(collider.Position.z - spaceCube.position.z) - spaceCube.scale.z / 2, 0);
            return new CmVector(x, y, z).SqrMagnitude > collider.RadiusPow;
        }
        internal static bool IsHit(CmSphereCollider sphereCollider1, CmSphereCollider sphereCollider2, out CmHitInfo hitInfo)
        {
            long distance = CmVector.SqrDistance(sphereCollider1.Position, sphereCollider2.Position);
            if (distance <= CmMath.PowSave(sphereCollider1.Radius + sphereCollider2.Radius))
            {
                CmVector point = (sphereCollider1.Position * sphereCollider2.Radius + sphereCollider2.Position * sphereCollider1.Radius) / (sphereCollider1.Radius + sphereCollider2.Radius);
                hitInfo = new CmHitInfo(point, (sphereCollider1.Position - sphereCollider2.Position).Normalized, sphereCollider2);
                return true;
            }
            else
            {
                hitInfo = new CmHitInfo();
                return false;
            }
        }
        internal static bool IsHit(CmSphereCollider sphereCollider, CmKinematicTrigger trigger, out CmHitInfo hitInfo)
        {
            long distance = CmVector.SqrDistance(sphereCollider.Position, trigger.position);
            if (distance <= CmMath.PowSave(sphereCollider.Radius + trigger.radius))
            {
                CmVector point = (sphereCollider.Position * trigger.radius + trigger.position * sphereCollider.Radius) / (sphereCollider.Radius + trigger.radius);
                hitInfo = new CmHitInfo(point, (sphereCollider.Position - trigger.position).Normalized, null);
                return true;
            }
            else
            {
                hitInfo = new CmHitInfo();
                return false;
            }
        }
        internal static bool IsHit(CmSphereCollider sphereCollider1, CmBoxCollider boxCollider2, out CmHitInfo hitInfo)
        {
            hitInfo = new CmHitInfo();
            return false;
        }
        internal static bool IsHit(CmSphereCollider sphereCollider, CmLineCollider lineCollider, out CmHitInfo hitInfo)
        {
            CmVector axisPoint = CmVector.ProjectPointOnAxis(sphereCollider.Position, lineCollider.Position, lineCollider.Right);
            hitInfo = new CmHitInfo(axisPoint, lineCollider.Forward, lineCollider);

            long sphereAxisSqrDistance = CmVector.SqrDistance(sphereCollider.Position, axisPoint);

            if (sphereAxisSqrDistance <= sphereCollider.RadiusPow)
            {
                long scaleXHalf = lineCollider.Scale.x / 2;


                return CmVector.SqrDistance(sphereCollider.Position, lineCollider.Position + ((lineCollider.Right * scaleXHalf) / CmMath.defoultMultiplier)) <= sphereCollider.RadiusPow
                    || CmVector.SqrDistance(sphereCollider.Position, lineCollider.Position - ((lineCollider.Right * scaleXHalf) / CmMath.defoultMultiplier)) <= sphereCollider.RadiusPow
                    || CmVector.SqrDistance(lineCollider.Position, axisPoint) <= lineCollider.ScalexPow / 4;
            }
            else
            {
                return false;
            }
        }
        internal static bool IsHit(CmSphereCollider sphereCollider, CmPlaneCollider planeCollider, out CmHitInfo hitInfo)
        {
            CmVector planePoint = CmVector.ProjectPointOnPlane(sphereCollider.Position, planeCollider.Position, planeCollider.Up);
            hitInfo = new CmHitInfo(planePoint, planeCollider.Up, planeCollider);
            return CmVector.SqrDistance(sphereCollider.Position, planePoint) <= sphereCollider.RadiusPow;
        }
        internal static bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position, CmKinematicTrigger kinematicTrigger)
        {
            return CmVector.SqrDistance(position, kinematicTrigger.position) < CmMath.Pow(subspacesScale + kinematicTrigger.radius, 2);
        }

        internal static bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position, CmPlaneCollider planeCollider)
        {
            CmVector planePoint = CmVector.ProjectPointOnPlane(position, planeCollider.Position, planeCollider.Up);
            return CmVector.SqrDistance(position, planePoint) < subspacesScalePow ;
        }
        internal static bool IsHitSubspace(long subspacesScale, long subspacesScalePow, CmVector position, CmLineCollider lineCollider)
        {
            CmVector axisPoint = CmVector.ProjectPointOnAxis(position, lineCollider.Position, lineCollider.Right);
            return CmVector.SqrDistance(position, axisPoint) < subspacesScalePow;
        }

        internal static bool IsHitSubspace(long SubspacesScale, long subspacesScalePow, CmVector position, CmSphereCollider cmSphereCollider)
        {
            return CmVector.SqrDistance(position, cmSphereCollider.position) < CmMath.PowSave(SubspacesScale + cmSphereCollider.Radius);
        }

        internal static bool SphereIsHitSubspace(CmVector centrePosition, long radiusPow, long scaleHalf, CmVector position)
        {
            long x = CmMath.ClampMin(CmMath.Abs(centrePosition.x - position.x) - scaleHalf, 0);
            long y = CmMath.ClampMin(CmMath.Abs(centrePosition.y - position.y) - scaleHalf, 0);
            long z = CmMath.ClampMin(CmMath.Abs(centrePosition.z - position.z) - scaleHalf, 0);
            return new CmVector(x, y, z).SqrMagnitude < radiusPow;
        }
       
        internal static bool IsHitSphere(CmSphereCollider sphereCollider, CmVector point, long radius, out CmHitInfo hitInfo)
        {
            long sqrDistance = CmVector.SqrDistance(sphereCollider.Position, point);
            if (sqrDistance <= CmMath.PowSave(sphereCollider.Radius + radius))
            {
                CmVector _point = (sphereCollider.Position * radius + point * sphereCollider.Radius) / (sphereCollider.Radius + radius);
                hitInfo = new CmHitInfo(_point, (point - sphereCollider.Position).Normalized, sphereCollider);
                return true;
            }
            else
            {
                hitInfo = new CmHitInfo();
                return false;
            }
        }
        internal static bool IsHitSphere(CmVector position, long RadiusPow, CmLineCollider lineCollider, out CmHitInfo hitInfo)
        {
            CmVector axisPoint = CmVector.ProjectPointOnAxis(position, lineCollider.Position, lineCollider.Right);
            hitInfo = new CmHitInfo(axisPoint, lineCollider.Forward, lineCollider);

            long sphereAxisSqrDistance = CmVector.SqrDistance(position, axisPoint);

            if (sphereAxisSqrDistance <= RadiusPow)
            {
                long scaleXHalf = lineCollider.Scale.x / 2;


                return CmVector.SqrDistance(position, lineCollider.Position + ((lineCollider.Right * scaleXHalf) / CmMath.defoultMultiplier)) <= RadiusPow
                    || CmVector.SqrDistance(position, lineCollider.Position - ((lineCollider.Right * scaleXHalf) / CmMath.defoultMultiplier)) <= RadiusPow
                    || CmVector.SqrDistance(lineCollider.Position, axisPoint) <= lineCollider.ScalexPow / 4;
            }
            else
            {
                return false;
            }
        }
    }
}
