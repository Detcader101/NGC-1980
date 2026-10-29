// Capture only while PTT owns this node. Output remains zero: never monitor the mic through the speakers.
class RadioMicrophone extends AudioWorkletProcessor {
  constructor(){super();this.chunk=new Float32Array(2048);this.used=0;this.recording=true;
    this.port.onmessage=()=>{if(this.used)this.port.postMessage(this.chunk.slice(0,this.used));this.used=0;this.recording=false;this.port.postMessage('flushed');};}
  process(inputs){
    const input=inputs[0]?.[0];if(!input||!this.recording)return true;
    for(const sample of input){this.chunk[this.used++]=sample;if(this.used===this.chunk.length){this.port.postMessage(this.chunk);this.used=0;}}
    return true;
  }
}
registerProcessor('radio-microphone',RadioMicrophone);
