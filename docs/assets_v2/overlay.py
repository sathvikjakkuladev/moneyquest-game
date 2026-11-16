# Copied from ../assets_v2 by tools/import-assets.ts. Do not edit; reference only, never run by the game.
# Head-tracked hair and face overlay on keyed avatar clip frames.
# Finds the head (topmost skin blob) in every frame, fits the rig head template to it, and draws
# hair-back under the sprite, then face and hair-front on top.  usage: import overlay; overlay.Overlay(...)
import json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
def skin(a):
    r,g,b,al=[a[...,k].astype(np.int32) for k in range(4)]
    return (r>g)&(g>b)&((r-b)>40)&(r>80)&(al>128)
def head_measure(a):
    m=skin(a); lab,n=ndi.label(m)
    if not n: return None
    ys,xs=np.where(m); top=ys.min()
    hid=lab[top,xs[ys==top][0]]; h=lab==hid
    ys,xs=np.where(h); y0=ys.min()
    band=h[y0:y0+int(0.75*(ys.max()-y0+1))]          # crown to jaw (skip neck)
    rows=band.sum(1); widest=int(np.argmax(rows)); xr=np.where(band[widest])[0]
    w=xr.max()-xr.min()+1; cx=(xr.max()+xr.min())/2
    return dict(top=float(y0),cx=float(cx),w=float(w),area=int(h.sum()))
class Overlay:
    def __init__(self,head_png,hair_meta,face_meta,hair_i,face_i,hair_rgb,eye_rgb):
        H=np.asarray(Image.open(head_png).convert('RGBA')); self.tm=head_measure(H); self.layers=[]
        def tint(L,c):
            a=np.asarray(L).astype(np.float32); a[...,:3]=np.clip(a[...,:3]/215.0*np.array(c),0,255); return Image.fromarray(a.astype(np.uint8))
        for m in json.load(open(hair_meta)):
            if m['i']==hair_i and not m.get('empty'):
                self.layers.append(('back' if m['layer']=='hair-back' else 'hair',tint(Image.open('layers/'+m['file']),hair_rgb),m['off']))
        if face_meta:
            for m in json.load(open(face_meta)):
                if m['i']==face_i and not m.get('empty'):
                    L=Image.open('layers/'+m['file'])
                    if m['layer']=='iris': a=np.asarray(L).copy(); a[...,:3]=eye_rgb; L=Image.fromarray(a)
                    self.layers.append(('face' if m['layer']=='face' else 'iris',L,m['off']))
        order={'back':0,'face':1,'iris':2,'hair':3}; self.layers.sort(key=lambda t:order[t[0]])
    def track(self,frames):
        ms=[head_measure(np.asarray(f)) for f in frames]
        # fill misses, then smooth position and size so the overlay doesn't jitter
        last=None
        for i,m in enumerate(ms):
            if m is None: ms[i]=last
            else: last=m
        arr={k:np.array([m[k] for m in ms],float) for k in ('top','cx','w')}
        # a sudden width jump means an arm is touching the head: hold the previous width
        med=ndi.median_filter(arr['w'],size=9,mode='nearest'); bad=np.abs(arr['w']-med)>0.08*med; arr['w'][bad]=med[bad]
        for k in arr: arr[k]=ndi.uniform_filter1d(arr[k],size=3,mode='nearest')
        self.track_=[dict(top=arr['top'][i],cx=arr['cx'][i],w=arr['w'][i]) for i in range(len(frames))]
    def compose(self,frame,i,pad=120):
        t=self.track_[i]; s=t['w']/self.tm['w']
        W,Hh=frame.size; out=Image.new('RGBA',(W+2*pad,Hh+2*pad),(0,0,0,0))
        ox=pad+t['cx']-self.tm['cx']*s; oy=pad+t['top']-self.tm['top']*s
        def put(L,off):
            l=L.resize((max(1,round(L.width*s)),max(1,round(L.height*s))),Image.LANCZOS)
            out.alpha_composite(l,(int(round(ox+off[0]*s)),int(round(oy+off[1]*s))))
        for kind,L,off in self.layers:
            if kind=='back': put(L,off)
        out.alpha_composite(frame,(pad,pad))
        for kind,L,off in self.layers:
            if kind!='back': put(L,off)
        return out
