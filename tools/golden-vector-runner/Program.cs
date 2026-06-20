// Golden Vector Runner — generates C# ground-truth physics fixtures for TS<->C# regression.
// Scale factor: 1 unit = 0.0001 m  (defoultMultiplier = 10000)
// All positions/velocities are fixed-point longs (no floats in output).
//
// Re-run to regenerate:
//   cd tools/golden-vector-runner
//   ~/.dotnet/dotnet run -c Release 2>/dev/null > ../../tests/fixtures/physics-golden-vectors.json

using System.Collections.Generic;
using System.Text.Json;
using CalculableMechanics;

// --- physics constants from Game.unity scene ---
const long BALL_MASS   = 1700;
const long BALL_RADIUS = 285;
const long TABLE_Y     = 9154;
const long BALL_Y      = 9440;  // TABLE_Y + BALL_RADIUS (rounded as in scene)

// Material: ball-ball contact
var BALL_MAT  = new CmMaterial(9499, 49, 200000, 500, 599);
// Material: table cloth (plane collider)
// Source: Game.unity PlaneCollider serialized field (lines 14171-14176), the result of
// CmMath.FromFloat(PlaneCmMateria.asset: 0.1/0.01/20/0.2/0.3) baked by Unity Editor.
// Runtime reads the serialized struct directly; FromFloat only runs in #if UNITY_EDITOR.
var CLOTH_MAT = new CmMaterial(1000, 99, 200000, 2000, 3000);
// Material: cushion rail
var RAIL_MAT  = new CmMaterial(6000, 0, 0, 0, 2000);

// --- helper: sphere collider ---
static CmSphereCollider MakeBall(long x, long y, long z, CmMaterial mat) =>
    new CmSphereCollider
    {
        position = new CmVector(x, y, z),
        right    = new CmVector(10000, 0, 0),
        up       = new CmVector(0, 10000, 0),
        forward  = new CmVector(0, 0, 10000),
        scale    = new CmVector(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS),
        radius   = BALL_RADIUS,
        material = mat
    };

static CmRigidbody MakeBody(int id, CmSphereCollider col)
{
    var b = new CmRigidbody { mass = BALL_MASS, Id = id };
    b.collider = col;
    return b;
}

// --- helper: line rail collider ---
static CmLineCollider MakeLine(int id,
    long px, long py, long pz,
    long rx, long ry, long rz,
    long ux, long uy, long uz,
    long fx, long fy, long fz,
    long scaleX, long radius, CmMaterial mat)
{
    var c = new CmLineCollider
    {
        position = new CmVector(px, py, pz),
        right    = new CmVector(rx, ry, rz),
        up       = new CmVector(ux, uy, uz),
        forward  = new CmVector(fx, fy, fz),
        scale    = new CmVector(scaleX, 5000, 5000),
        radius   = radius,
        material = mat
    };
    c.Id = id;
    return c;
}

// --- table geometry (plane + rails, values from Game.unity) ---
static List<ICmCollider> MakeTable(CmMaterial cloth, CmMaterial rail)
{
    var list = new List<ICmCollider>();
    int id = 0;

    // Table plane (cloth surface)
    var plane = new CmPlaneCollider
    {
        position = new CmVector(0, TABLE_Y, 0),
        right    = new CmVector(10000, 0, 0),
        up       = new CmVector(0, 10000, 0),
        forward  = new CmVector(0, 0, 10000),
        scale    = new CmVector(25399, 5000, 12699),
        radius   = 12699,
        material = cloth
    };
    plane.Id = id++; list.Add(plane);

    // Right long rail  x=+12699  (right=(0,0,+1), faces -x)
    list.Add(MakeLine(id++,  12699, BALL_Y,     0,   0,0,10000, 0,10000,0, -10000,0,0,   11150, 5575, rail));
    // Left long rail   x=-12699  (right=(0,0,-1), faces +x)
    list.Add(MakeLine(id++, -12699, BALL_Y,     0,   0,0,-10000, 0,10000,0, 10000,0,0,   11150, 5575, rail));
    // Back short rail  z=+6349   (right=(-1,0,0), faces -z)
    list.Add(MakeLine(id++,   6290, BALL_Y,  6349,  -10000,0,0, 0,10000,0, 0,0,-10000,   11269, 5634, rail));
    // Front short rail z=-6349   (right=(+1,0,0), faces +z)
    list.Add(MakeLine(id++,  -6290, BALL_Y, -6349,   10000,0,0, 0,10000,0, 0,0, 10000,   11269, 5634, rail));

    // Corner pocket cushion guards (angled, from scene)
    list.Add(MakeLine(id++,   12128, BALL_Y,  6552,  -7071,0,-7071, 0,10000,0,  7071,0,-7071,  570, 285, rail));
    list.Add(MakeLine(id++,   12901, BALL_Y,  5778,   7071,0, 7071, 0,10000,0, -7071,0, 7071,  569, 284, rail));
    list.Add(MakeLine(id++,  -12128, BALL_Y, -6552,   7071,0, 7071, 0,10000,0, -7071,0, 7071,  570, 285, rail));
    list.Add(MakeLine(id++,  -12901, BALL_Y, -5778,  -7071,0,-7071, 0,10000,0,  7071,0,-7071,  569, 284, rail));

    return list;
}

// --- pocket triggers (6 pockets) ---
static List<CmKinematicTrigger> MakePockets()
{
    long[,] pos = {
        {  12875, BALL_Y,  6510 }, {  12875, BALL_Y, -6510 },
        { -12875, BALL_Y,  6510 }, { -12875, BALL_Y, -6510 },
        {      0, BALL_Y,  7100 }, {      0, BALL_Y, -7100 }
    };
    var list = new List<CmKinematicTrigger>();
    for (int i = 0; i < 6; i++)
        list.Add(new CmKinematicTrigger { Id=i, position=new CmVector(pos[i,0],pos[i,1],pos[i,2]), radius=450 });
    return list;
}

static CmSpaceCube MakeSpace() =>
    new CmSpaceCube { position = CmVector.zero, scale = new CmVector(30000, 20000, 20000) };

// --- run one shot scenario ---
static GoldenVector RunShot(
    string gvId, string desc,
    List<CmRigidbody> bodies,
    List<ICmCollider> colls,
    List<CmKinematicTrigger> pockets,
    CmSpaceCube space,
    long impX, long impY, long impZ,
    long torX, long torY, long torZ)
{
    var sim = new CmSpace();
    sim.Init(space, bodies, colls, pockets);

    // Capture start positions BEFORE simulation (eager list, not LINQ deferred)
    var startPositions = new System.Collections.Generic.List<object>();
    foreach (var b in bodies)
    {
        var p = b.collider.Position;
        startPositions.Add(new { id = b.Id, x = p.x, y = p.y, z = p.z });
    }

    // Hit point = cue ball centre
    var impulse  = new CmVector(impX, impY, impZ);
    var torque   = new CmVector(torX, torY, torZ);
    var cueBall  = bodies[0];
    var hitPt    = cueBall.collider.Position;

    cueBall.AddImpulse(impulse, hitPt, CmForceMode.Impulse);
    if (torque != CmVector.zero)
        cueBall.AddTorque(torque, CmForceMode.Impulse);

    int steps = 0;
    const int MAX = 2_000_000;
    while (sim.IsActive && steps < MAX)
    {
        sim.Calculate(null, false);
        steps++;
    }

    var states = new List<BodyState>();
    foreach (var b in bodies)
    {
        var p = b.collider.Position;
        var v = b.Velocity;
        var a = b.AngularVelocity;
        states.Add(new BodyState(b.Id, p.x, p.y, p.z, v.x, v.y, v.z, a.x, a.y, a.z,
            b.IsActive, b.IsKinematic, b.IsOutOfCube, b.KinematicTriggerId));
    }

    var inputRecord = new
    {
        ballPositions = startPositions,
        impulse  = new { x=impX, y=impY, z=impZ },
        torque   = new { x=torX, y=torY, z=torZ },
        hitPoint = new { x=hitPt.x, y=hitPt.y, z=hitPt.z }
    };

    return new GoldenVector(gvId, desc, inputRecord, states, steps);
}

// --- Main ---
var colls   = MakeTable(CLOTH_MAT, RAIL_MAT);
var pockets = MakePockets();
var space   = MakeSpace();
var results = new List<GoldenVector>();

// GV-01: Single ball straight roll, medium speed
{
    var b0 = MakeBody(0, MakeBall(-5000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-01",
        "Single ball straight roll x-axis, medium impulse (30000), stops via friction",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        30000,0,0,  0,0,0));
}

// GV-02: Single ball bounces off right rail
{
    var b0 = MakeBody(0, MakeBall(9000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-02",
        "Single ball into right rail (x=+12699), bounces and stops",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        60000,0,0,  0,0,0));
}

// GV-03: Head-on ball-to-ball collision
{
    var b0 = MakeBody(0, MakeBall(-4000, BALL_Y, 0, BALL_MAT));
    var b1 = MakeBody(1, MakeBall(    0, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-03",
        "Head-on collision: cue stops, object ball continues forward",
        new List<CmRigidbody>{b0, b1}, colls, pockets, space,
        30000,0,0,  0,0,0));
}

// GV-04: Half-ball cut (angled collision)
{
    var b0 = MakeBody(0, MakeBall(-4000, BALL_Y,   0, BALL_MAT));
    var b1 = MakeBody(1, MakeBall(    0, BALL_Y, 570, BALL_MAT));
    results.Add(RunShot("GV-04",
        "Half-ball cut: cue at z=0 shoots object ball offset by one radius (z=570)",
        new List<CmRigidbody>{b0, b1}, colls, pockets, space,
        30000,0,0,  0,0,0));
}

// GV-05: High-speed shot near MaxVelocity=65000
{
    var b0 = MakeBody(0, MakeBall(-6000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-05",
        "High-speed shot (impulse 62000) — tests sub-step collision prevention",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        62000,0,0,  0,0,0));
}

// GV-06: Low-speed roll — three-phase friction test
{
    var b0 = MakeBody(0, MakeBall(-1000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-06",
        "Low-speed shot (8000): slide->roll->stop three-phase friction",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        8000,0,0,  0,0,0));
}

// GV-07: Back-spin (draw) — torque (0,0,+20000) on ball moving +x = back-spin (ball reverses direction)
{
    var b0 = MakeBody(0, MakeBall(-5000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-07",
        "Back-spin draw: forward impulse 20000 + back-spin torque (0,0,+20000) — ball reverses direction",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        20000,0,0,  0,0,20000));
}

// GV-08: Three-ball cluster chain
{
    var b0 = MakeBody(0, MakeBall(-8000, BALL_Y,   0, BALL_MAT));
    var b1 = MakeBody(1, MakeBall(    0, BALL_Y,   0, BALL_MAT));
    var b2 = MakeBody(2, MakeBall(  570, BALL_Y, 285, BALL_MAT));
    results.Add(RunShot("GV-08",
        "Three-ball cluster: cue -> object1 -> object2 chain reaction",
        new List<CmRigidbody>{b0, b1, b2}, colls, pockets, space,
        40000,0,0,  0,0,0));
}

// GV-09: Top-spin (follow) — torque (0,0,-20000) on ball moving +x = top-spin (ball rolls farther)
{
    var b0 = MakeBody(0, MakeBall(-5000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-09",
        "Top-spin follow: forward impulse 20000 + top-spin torque (0,0,-20000) — ball rolls farther forward",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        20000,0,0,  0,0,-20000));
}

// GV-10: Cue ball scratch — straight into side pocket (pocketId 4 or 5)
{
    var b0 = MakeBody(0, MakeBall(0, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-10",
        "Cue ball scratch: ball aimed directly into side pocket (pocket 4, z=+7100)",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        0,0,30000,  0,0,0));
}

// GV-11: Target ball into corner pocket 0 (x=+12875 z=+6510)
//   3-4-5 triangle geometry: b0->b1 distance = 2000 (collision at step 2, before b1 deactivates)
//   impulse (18000,0,24000) magnitude=30000 along same 3:4 slope as b0->b1 (head-on shot)
//   b1 at (11975,5310) continues in (3,4) direction to pocket 0 at (12875,6510) — rails not hit
{
    var b0 = MakeBody(0, MakeBall(10775, BALL_Y, 3710, BALL_MAT));
    var b1 = MakeBody(1, MakeBall(11975, BALL_Y, 5310, BALL_MAT));
    results.Add(RunShot("GV-11",
        "Target ball into corner pocket 0 (+x,+z): b0 hits b1 at 53deg (3:4 slope), b1 pockets",
        new List<CmRigidbody>{b0, b1}, colls, pockets, space,
        18000,0,24000,  0,0,0));
}

// GV-12: Side-spin (english): impulse (30000,0,0) + left-spin torque (0,+25000,0)
//   Top-down: left-spin = clockwise when viewed from above → ball curves right after sliding phase.
//   Tests that y-axis angular velocity affects trajectory via the rolling constraint.
{
    var b0 = MakeBody(0, MakeBall(-5000, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-12",
        "Side-spin (left english): impulse (30000,0,0) + y-axis spin torque (0,+25000,0) — ball curves right",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        30000,0,0,  0,25000,0));
}

// GV-13: Diagonal shot with back-spin: impulse at 45° + back-spin torque on z
//   Tests spin on a non-axis-aligned trajectory (combined x+z motion with spin).
{
    var b0 = MakeBody(0, MakeBall(0, BALL_Y, 0, BALL_MAT));
    results.Add(RunShot("GV-13",
        "Diagonal back-spin: impulse (21213,0,21213) ~30000 at 45deg + back-spin (0,0,+15000) — ball reverses diagonally",
        new List<CmRigidbody>{b0}, colls, pockets, space,
        21213,0,21213,  0,0,15000));
}

// ─── Fuzz: 1000 random ShotData cases (seeded, deterministic) ────────────────
// Covers: max-force, spin (back/top), multi-ball (2-3), rail-bounce angles,
//         diagonal shots, pocket-aimed shots.
// Seed = 42 for reproducibility. Output appended to same JSON array as GV-01~11.
{
    var rng = new System.Random(42);

    long RandRange(long lo, long hi) => lo + (long)(rng.NextDouble() * (hi - lo));

    // Discretised angle set: 0=+x, 1=+z, 2=-x, 3=-z, 4=+x+z(diag), 5=+x-z(diag), 6=-x+z, 7=-x-z
    long[] cosTable = {10000, 0,      -10000, 0,      7071,  7071, -7071, -7071};
    long[] sinTable = {0,     10000,  0,     -10000,  7071, -7071,  7071, -7071};

    // Safe ball-spawn zones: x ∈ [-10000,10000], z ∈ [-5000,5000]
    long RandX() => RandRange(-10000, 10000);
    long RandZ() => RandRange(-5000,   5000);

    for (int fi = 0; fi < 1000; fi++)
    {
        int   category = fi % 5; // 0=straight,1=spin,2=two-ball,3=three-ball,4=high-force
        int   angleIdx = rng.Next(8);
        long  force    = category == 4 ? RandRange(55000, 65000) : RandRange(8000, 45000);
        long  impX     = force * cosTable[angleIdx] / 10000;
        long  impZ     = force * sinTable[angleIdx] / 10000;
        long  torZ     = category == 1 ? (rng.Next(2) == 0 ? 1L : -1L) * RandRange(5000, 20000) : 0L;

        long bx0 = RandX();
        long bz0 = RandZ();
        // Ensure ball is not in pocket zone (x²+z² relative to each pocket < 600²)
        // Simple guard: avoid corners
        if (bx0 > 11000 && bz0 > 4000) bx0 = -bx0;
        if (bx0 > 11000 && bz0 < -4000) bz0 = -bz0;
        if (bx0 < -11000 && bz0 > 4000) bx0 = -bx0;
        if (bx0 < -11000 && bz0 < -4000) bz0 = -bz0;

        var bodies = new List<CmRigidbody> { MakeBody(0, MakeBall(bx0, BALL_Y, bz0, BALL_MAT)) };

        if (category == 2 || category == 3)
        {
            // Second ball offset from first in shot direction
            long dx = cosTable[angleIdx] * 2000 / 10000;
            long dz = sinTable[angleIdx] * 2000 / 10000;
            long bx1 = bx0 + dx, bz1 = bz0 + dz;
            if (bx1 > 11000) bx1 = bx0 - dx;
            if (bx1 < -11000) bx1 = bx0 - dx;
            if (bz1 > 5500) bz1 = bz0 - dz;
            if (bz1 < -5500) bz1 = bz0 - dz;
            bodies.Add(MakeBody(1, MakeBall(bx1, BALL_Y, bz1, BALL_MAT)));
        }
        if (category == 3)
        {
            long bx2 = bx0 + cosTable[angleIdx] * 4000 / 10000;
            long bz2 = bz0 + sinTable[angleIdx] * 4000 / 10000;
            if (bx2 > 11000) bx2 = bx0;
            if (bx2 < -11000) bx2 = bx0;
            if (bz2 > 5500) bz2 = bz0;
            if (bz2 < -5500) bz2 = bz0;
            bodies.Add(MakeBody(2, MakeBall(bx2, BALL_Y, bz2, BALL_MAT)));
        }

        string fid  = $"FUZZ-{fi+1:D4}";
        string desc = $"cat={category} angle={angleIdx} force={force} torZ={torZ} balls={bodies.Count}";
        results.Add(RunShot(fid, desc, bodies, colls, pockets, space, impX, 0, impZ, 0, 0, torZ));
    }
}

var opts = new JsonSerializerOptions { WriteIndented = true };
System.Console.WriteLine(JsonSerializer.Serialize(results, opts));

// --- type declarations (must follow all top-level statements) ---
record BodyState(int id,
    long px, long py, long pz,
    long vx, long vy, long vz,
    long ax, long ay, long az,
    bool isActive, bool isKinematic, bool isOutOfCube, int pocketId);

record GoldenVector(string id, string description, object input, List<BodyState> output, int simSteps);
