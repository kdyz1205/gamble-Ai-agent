import assert from 'node:assert/strict';
import {proofInterfaceCopy} from '../src/lib/proof-interface-copy';
let checks=0;
for(const [en,zh]of [['Evidence description','证据说明'],['Public evidence link','公开证据链接'],['Submit proof','提交证据'],['Cancel media capture','取消媒体采集'],['Record video','录制视频'],['Take photo','拍摄照片'],['Use a valid public HTTPS link to the proof file.','请输入有效的公开 HTTPS 证据链接。'],['Uploading...','正在上传…']]){assert.equal(proofInterfaceCopy('en',en),en);assert.equal(proofInterfaceCopy('zh',en),zh);checks+=2;}
for(const text of ['SYNTHETIC_UPLOAD_NOT_CONFIGURED','Actual player statement / 原文','https://example.invalid/secret?x=42','A server error with a receipt reference','', 'Upload failed (401). Your proof was not submitted.']){assert.equal(proofInterfaceCopy('en',text),text);checks++;}
assert.equal(proofInterfaceCopy('zh','Upload failed (503). Your proof was not submitted.'),'上传失败（503），证据尚未提交。');checks++;
for(const text of ['SYNTHETIC_UPLOAD_NOT_CONFIGURED','My own statement 原文','Unexpected error code 1007']){assert.equal(proofInterfaceCopy('zh',text),text);checks++;}
console.log(`PROOF_INTERFACE_COPY_PASS ${checks} interface-only translation and original-content preservation checks`);
