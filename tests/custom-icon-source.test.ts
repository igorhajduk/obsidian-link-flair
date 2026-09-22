import { describe, expect, it, vi } from 'vitest';
import { importIconSource } from '../src/custom-icon-source';
import type { WebResponse } from '../src/metadata';
const response = (text: string, type='text/html'): WebResponse => ({status:200,headers:{'Content-Type':type},text,arrayBuffer:new TextEncoder().encode(text).buffer});

describe('explicit icon source', () => {
  it('uses declared website icons, resolving paths from the supplied page', async () => {
    const request=vi.fn(async(url:string)=>url.endsWith('icon.svg')?response('<svg/>','image/svg+xml'):response('<base href="/assets/"><link rel="icon" href="icon.svg" type="image/svg+xml">'));
    const decode=vi.fn(async()=> 'prepared-png');
    expect(await importIconSource('https://www.jetbrains.com/teamcity/download/',request,decode,'light')).toBe('prepared-png');
    expect(request.mock.calls.map(([url])=>url)).toEqual(['https://www.jetbrains.com/teamcity/download/','https://www.jetbrains.com/assets/icon.svg']);
  });
  it('accepts direct images and scheme-less websites',async()=>{
    const request=vi.fn(async()=>response('image','image/png'));
    expect(await importIconSource('icons.example/icon.png',request,async()=> 'png','light')).toBe('png');
    expect(request).toHaveBeenCalledExactlyOnceWith('https://icons.example/icon.png');
  });
  it('tries the next candidate after an invalid image and supports explicitly selected private sites',async()=>{
    const request=vi.fn(async(url:string)=>url.endsWith('/good.png')?response('image','image/png'):url.endsWith('/broken.svg')?response('broken','image/svg+xml'):response('<link rel="icon" href="/broken.svg"><link rel="icon" href="/good.png">'));
    expect(await importIconSource('https://intranet.test/issues/123',request,async(_bytes,type)=>{if(type==='image/svg+xml')throw Error('broken');return 'png';},'light')).toBe('png');
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('ignores non-web declarations and credentials, then tries the origin favicon',async()=>{
    const request=vi.fn(async(url:string)=>url.endsWith('/favicon.ico')?response('image','image/x-icon'):response('<link rel="icon" href="file:///private"><link rel="icon" href="https://user:secret@host/icon.png">'));
    expect(await importIconSource('https://example.com/page',request,async()=> 'png','light')).toBe('png');
    expect(request.mock.calls.map(([url])=>url)).toEqual(['https://example.com/page','https://example.com/favicon.ico']);
  });
  it('explains missing favicons without treating HTML as an image',async()=>{
    const decode=vi.fn();
    await expect(importIconSource('https://example.com/',vi.fn(async()=>response('Sign in')),decode,'light')).rejects.toThrow('No usable favicon');
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects oversized responses and credential-bearing sources',async()=>{
    const request=vi.fn(async()=>({...response(''),arrayBuffer:new ArrayBuffer(2*1024*1024+1)}));
    await expect(importIconSource('https://example.com/',request,vi.fn(),'light')).rejects.toThrow('larger than 2 MB');
    request.mockClear();
    await expect(importIconSource('https://user:secret@example.com/',request,vi.fn(),'light')).rejects.toThrow('credentials');
    expect(request).not.toHaveBeenCalled();
  });
});
