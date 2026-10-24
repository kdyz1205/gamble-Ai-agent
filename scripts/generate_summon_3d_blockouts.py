#!/usr/bin/env python3
"""Deterministic procedural, editable GLB creature *blockouts*.

This produces real 3-D triangulated geometries in a glTF scene, NOT a rig,
texture-baked model, animation, watertight 3-D print, or production character.
The meshes are original primitives whose species proportions are derived from
Summoner.world's in-repository creature visual bible.

Coordinate convention: x left/right, negative y forward, z up (meters).
"""
from __future__ import annotations
import argparse
import json
import math
import pathlib
import numpy as np
import trimesh

COL = {
    'aqua': '#73DCE2', 'aqua_light': '#C0F9F5', 'aqua_dark': '#3FADC7',
    'iris_teal': '#1D7B8E', 'glass': '#96F2ED', 'lavender': '#A996F0',
    'cream': '#FFE9CD', 'peach': '#F4A282', 'coral': '#F18F7D',
    'amber': '#976333', 'white': '#FFFDF6', 'black': '#172C3D',
    'moss': '#85CBA7', 'moss_dark': '#52A67E', 'leaf': '#ABD67D',
    'leaf_light': '#DDF5A9', 'wood': '#C1B28B', 'hooves': '#A5A18C',
    'blue': '#6098EA', 'gold': '#FFD17E', 'purple': '#9774E0',
}

def rgba(h):
    h = COL.get(h, h).lstrip('#')
    return np.array([int(h[i:i+2], 16) for i in (0,2,4)] + [255], dtype=np.uint8)

class Body:
    def __init__(self):
        self.scene = trimesh.Scene()
        self.parts = []

    def add(self, name, mesh, c):
        if len(mesh.vertices) == 0 or len(mesh.faces) == 0:
            raise ValueError(name)
        mesh.visual.vertex_colors = np.broadcast_to(rgba(c), (len(mesh.vertices), 4)).copy()
        mesh.metadata['part_name'] = name
        self.scene.add_geometry(mesh, node_name=name, geom_name=name)
        self.parts.append(name)

    def ellipsoid(self, name, center, scale, c, subdivisions=2, rot=None):
        m = trimesh.creation.icosphere(subdivisions=subdivisions, radius=1)
        m.vertices *= np.asarray(scale, dtype=float)
        if rot:
            angle, axis = rot
            m.apply_transform(trimesh.transformations.rotation_matrix(angle, axis))
        m.apply_translation(center)
        self.add(name, m, c)

    def connector(self, name, p, q, radius, c, sections=10):
        p, q = np.asarray(p, dtype=float), np.asarray(q, dtype=float)
        delta=q-p
        norm=np.linalg.norm(delta)
        if norm<0.001: raise ValueError(name)
        m=trimesh.creation.cylinder(radius=radius,height=norm,sections=sections)
        m.apply_transform(trimesh.geometry.align_vectors([0,0,1], delta/norm))
        m.apply_translation((p+q)*0.5)
        self.add(name,m,c)

    def ribbon(self, name, curve, width, c, r=0.050):
        # Multiple connected, smoothly faceted tubes make a visible structural
        # tail or energy loop that can be individually edited in Blender.
        for i in range(len(curve)-1):
            self.connector(f'{name}_{i:02d}',curve[i],curve[i+1],width,c,sections=8)
        for i, p in enumerate(curve[1:-1:2]):
            self.ellipsoid(f'{name}_joint_{i}', p, [width*1.04]*3, c, 1)

    def eye(self, label, x, y, z, iris='iris_teal',scale=1):
        # Round expressive eyes: whites, colored iris, pupil, catchlight.
        self.ellipsoid(f'{label}_white',(x,y,z),(.208*scale,.105*scale,.238*scale),'white',2)
        self.ellipsoid(f'{label}_iris',(x,y-.097*scale,z),(.148*scale,.058*scale,.170*scale),iris,2)
        self.ellipsoid(f'{label}_pupil',(x,y-.146*scale,z),(.086*scale,.042*scale,.113*scale),'black',2)
        self.ellipsoid(f'{label}_shine',(x-.046*scale,y-.187*scale,z+.064*scale),(.046*scale,.025*scale,.060*scale),'white',2)

    def validate(self):
        if len(self.parts) != len(set(self.parts)):
            raise AssertionError('duplicate node names')
        if not self.parts: raise AssertionError('empty scene')
        bounds = self.scene.bounds
        if not np.isfinite(bounds).all() or np.max(bounds[1]-bounds[0]) > 12:
            raise AssertionError('improper 3D extents')
        for geom in self.scene.geometry.values():
            assert len(geom.faces) > 0 and np.isfinite(geom.vertices).all()
            assert geom.is_winding_consistent and geom.is_watertight
        return bounds


def paws(b, family, positions, c, hoof=None):
    for side, row, x, y, z in positions:
        if family=='mossprite':
            b.ellipsoid(f'{row}_{side}_leg',(x,y,z+0.27),(.16,.19,.35),c,2)
            b.ellipsoid(f'{row}_{side}_hoof',(x,y-.045,z),(.18,.23,.14),hoof or 'hooves',2)
        elif family=='stridekin':
            scales=(.26,.26,.45) if row=='hind' else (.17,.18,.31)
            b.ellipsoid(f'{row}_{side}_leg',(x,y+.045,z+0.32),(scales[0],scales[1],scales[2]+.12),c,2)
            b.ellipsoid(f'{row}_{side}_paw',(x,y-.10,z),(.23,.31,.155),c,2)
        else:
            b.ellipsoid(f'{row}_{side}_upperleg',(x,y+.08,z+.34),(.19,.24,.45),c,2)
            b.ellipsoid(f'{row}_{side}_paw',(x,y,z),(.22,.31,.30),c,2)


def circuitling(stage:int) -> Body:
    b=Body()
    shell = 'aqua' if stage<5 else 'aqua_dark'
    b.ellipsoid('body_pear',(0,.12,1.01),(.65,.94,.58),shell,3)
    # Preserve FOUR independent paws, rear paws partially behind body.
    paws(b,'circuitling',[(side,row,x,y,.32) for row,y in [('front',-.54),('rear',.70)] for side,x in [('left',-.42),('right',.42)]],shell)
    b.ellipsoid('head_oversized',(0,-.64,1.89),(.86,.77,.80),shell,3)
    b.ellipsoid('chin_muzzle',(0,-1.25,1.53),(.42,.29,.24),'aqua_light',2)
    b.ellipsoid('nose',(0,-1.505,1.65),(.100,.067,.065),'peach',2)
    for side, s in [('left',-1),('right',1)]:
        x=.45*s
        b.eye(f'{side}_eye',x,-1.23,2.02,scale=.96)
        # Otter fins are visually separated from eyes/other anatomy.
        b.ellipsoid(f'{side}_fin_outer',(.89*s,-.47,2.27),(.26,.095,.53),'glass',2,rot=(s*0.54,[0,1,0]))
        b.ellipsoid(f'{side}_fin_inner',(.91*s,-.59,2.27),(.15,.058,.38),'aqua_light',2,rot=(s*0.54,[0,1,0]))
    b.ellipsoid('smile',(0,-1.493,1.48),(.13,.030,.030),'aqua_dark',1)
    # Segmented tail extends sideways behind the right shoulder; one tail only.
    theta = np.linspace(-2.08,2.24,12)
    center=np.array([1.25,.60,1.24])
    curve=[]
    for t in theta:
        curve.append((center + np.array([.60*math.cos(t), .12*math.sin(t), .64*math.sin(t)])).tolist())
    b.connector('tail_root',(.53,.67,1.0),curve[0],.16,shell,sections=9)
    b.ribbon('tail_polygon',curve,.12,'glass')
    total={1:3,3:6,5:9}[stage]
    for i in range(total):
        t=2*math.pi*i/total
        p=(1.25+.77*math.cos(t),.38,1.23+.79*math.sin(t))
        b.ellipsoid(f'floating_logic_tile_{i:02d}',p,(.09,.075,.092),['lavender','gold','blue'][i%3],1,
                    rot=(t/2,[0,1,0]))
    if stage>=3:
        b.ellipsoid('crown_glass',(0,-.70,2.60),(.20,.16,.23),'glass',2)
        b.ribbon('head_traces',[(-.48,-.98,2.35),(-.17,-1.29,2.52),(.12,-1.38,2.52),(.46,-.99,2.35)],.029,'lavender')
    if stage==5:
        b.ellipsoid('crown_center',(0,-.75,2.76),(.13,.12,.20),'lavender',2)
        for x in (-.58,.58):
            b.ellipsoid(f'luminescent_spine_{x}',(x,-.35,1.31),(.13,.15,.33),'glass',1)
    b.validate()
    return b


def stridekin(stage:int) -> Body:
    b=Body()
    b.ellipsoid('body',(0,.2,1.06),(.61,.88,.58),'cream',3)
    paws(b,'stridekin',[(side,row,x,y,.26) for row,y in [('front',-.42),('hind',.72)] for side,x in [('left',-.41),('right',.41)]],'cream')
    b.ellipsoid('rabbit_face',(0,-.63,1.87),(.77,.64,.68),'cream',3)
    b.ellipsoid('face_muzzle',(0,-1.185,1.56),(.33,.17,.20),'white',2)
    b.ellipsoid('pink_nose',(0,-1.35,1.62),(.090,.063,.058),'coral',2)
    for side,s in [('left',-1),('right',1)]:
        b.eye(f'{side}_eye',s*.37,-1.13,1.96,iris='amber',scale=.86)
        b.ellipsoid(f'{side}_outer_ear',(s*.38,-.47,2.73),(.25,.16,.67),'cream',2,rot=(s*.21,[0,1,0]))
        b.ellipsoid(f'{side}_inner_ear',(s*.38,-.625,2.77),(.16,.06,.48),'peach',2,rot=(s*.21,[0,1,0]))
    # One coral ribbon tail loops beside left hindquarters.
    seq=[]
    for i,t in enumerate(np.linspace(-.5,4.12,16)):
        seq.append((-1.14+.55*math.cos(t),.70,1.14+.56*math.sin(t)))
    b.connector('tail_root',(-.48,.68,1.07),seq[0],.12,'coral')
    b.ribbon('coral_tail_ribbon',seq,.075,'coral')
    # Decorative kinetic strips around ankles; no extra limb meshes.
    if stage>=3:
        for s in (-1,1):
            p=[(.36*s,-.51,.46),(.56*s,-.63,.49),(.51*s,-.78,.32),(.32*s,-.62,.24)]
            b.ribbon(f'speed_ankle_{s}',p,.036,'aqua_light')
    if stage==5:
        for x in [-.26,.26]:
            b.ellipsoid(f'shoulder_fur_glow_{x}',(x,.15,1.48),(.16,.24,.19),'peach',2)
        for k in range(2):
            p=[(-1.64-.22*k,.60,1.02),(-1.95-.20*k,.40,1.43),(-1.70-.20*k,.15,1.93)]
            b.ribbon(f'comet_trail_{k}',p,.040,'glass' if k else 'gold')
    b.validate();return b


def mossprite(stage:int) -> Body:
    b=Body()
    b.ellipsoid('body_fawn',(0,.15,1.13),(.64,.82,.55),'moss',3)
    paws(b,'mossprite',[(side,row,x,y,.25) for row,y in [('front',-.48),('hind',.63)] for side,x in [('left',-.39),('right',.39)]],'moss')
    b.ellipsoid('deer_face',(0,-.58,1.94),(.72,.67,.69),'moss',3)
    b.ellipsoid('cream_muzzle',(0,-1.115,1.62),(.35,.22,.24),'cream',2)
    b.ellipsoid('tiny_nose',(0,-1.31,1.72),(.077,.049,.059),'hooves',1)
    for side,s in [('left',-1),('right',1)]:
        b.eye(f'{side}_eye',s*.37,-1.11,2.00,iris='amber',scale=.91)
        b.ellipsoid(f'{side}_ear',(s*.71,-.39,2.25),(.31,.145,.23),'moss',2,rot=(s*.30,[0,0,1]))
        b.ellipsoid(f'{side}_ear_inner',(s*.75,-.53,2.25),(.22,.08,.16),'peach',2)
    # Moss collar, clearly behind head, leafy rather than clipped to face.
    for i,angle in enumerate(np.linspace(-1.2,1.2,7)):
        b.ellipsoid(f'moss_mane_leaf_{i}',(.54*math.sin(angle),-.73,1.25+.13*math.cos(angle)),(.17,.20,.29),'leaf' if i%2 else 'moss_dark',1,rot=(angle*.5,[0,1,0]))
    n_branch={1:2,3:3,5:4}[stage]
    for side,s in [('left',-1),('right',1)]:
        x=s*.41
        p0=(x,-.47,2.44)
        p1=(x*1.20,-.47,2.84)
        p2=(x*1.45,-.47,3.14 if stage!=5 else 3.37)
        b.connector(f'{side}_antler_base',p0,p1,.066,'wood')
        b.connector(f'{side}_antler_stem',p1,p2,.046,'wood')
        for i in range(n_branch):
            z=2.81+.17*i
            a=(x*1.2+s*.07*i,-.47,z)
            target=(a[0]+s*(.26+.045*i),-.45,z+.16)
            b.connector(f'{side}_branch_{i}',a,target,.035,'wood',sections=8)
            b.ellipsoid(f'{side}_leaf_{i}',target,(.092,.070,.155),'leaf_light' if i%2 else 'leaf',1,
                rot=(s*.55,[0,1,0]))
    # Teardrop tail one only.
    b.ellipsoid('short_leaf_tail',(0,1.02,1.25),(.21,.27,.17),'leaf',2)
    if stage>=3:
        for side,x in [('left',-.30),('right',.30)]:
            b.ellipsoid(f'dew_bead_{side}',(x,.58,1.62),(.055,.059,.068),'glass',2)
    if stage==5:
        for i,p in enumerate([(0,-.2,2.95),(-.93,.08,2.62),(.93,.09,2.66)]):
            b.ellipsoid(f'forest_pollen_{i}',p,(.068,.067,.080),'gold',1)
    b.validate();return b

BUILDERS={'circuitling':circuitling,'stridekin':stridekin,'mossprite':mossprite}
STAGES={1:'base',3:'evolved',5:'ascended'}

def generate(output: pathlib.Path, families, stages):
    output.mkdir(parents=True,exist_ok=True)
    manifest=[]
    for family in families:
        for lv in stages:
            model=BUILDERS[family](lv)
            out=output/f'{family}-{STAGES[lv]}.glb'
            model.scene.export(out)
            loaded=trimesh.load(out,force='scene')
            if not isinstance(loaded,trimesh.Scene):raise ValueError('reimported scene invalid')
            if not loaded.geometry: raise ValueError('empty imported GLB')
            bounds=loaded.bounds
            if not np.isfinite(bounds).all(): raise ValueError('invalid bounds')
            manifest.append({'name':out.name,'family':family,'stage':STAGES[lv],
                             'meshNodes':len(loaded.geometry),'bytes':out.stat().st_size,
                             'extents':[round(float(v),3) for v in loaded.extents.tolist()],
                             'triangles':sum(len(m.faces) for m in loaded.geometry.values()),
                             'format':'glb','status':'procedural-3d-blockout'})
    (output/'model-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--out',default='summoner-glb-blockouts');
    a.add_argument('--family',choices=['all',*BUILDERS],default='all');a.add_argument('--stage',choices=['all','base','evolved','ascended'],default='all');args=a.parse_args()
    fams=list(BUILDERS) if args.family=='all' else [args.family]
    levels=list(STAGES) if args.stage=='all' else [lv for lv,n in STAGES.items() if n==args.stage]
    for item in generate(pathlib.Path(args.out),fams,levels):print(json.dumps(item))
