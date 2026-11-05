import serial,time,sys
s=serial.Serial(); s.port='COM8'; s.baudrate=115200; s.timeout=1; s.dtr=False; s.rts=False; s.open()
t=time.time()
while time.time()-t<float(sys.argv[1]):
    l=s.readline()
    if l: print(l.decode(errors='replace').rstrip(),flush=True)
