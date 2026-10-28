import type {SumLanguage} from '@/components/locale/SumLanguage';
/** UI-only translations. Unknown server messages and user-authored evidence stay verbatim. */
const copy:Record<string,string>={
 'Proof camp':'证据提交','Each friend adds their own clear, traceable proof.':'每位玩家提交自己的真实证据。',
 'Record video':'录制视频','One continuous clip':'保持连续录制','Take photo':'拍摄照片','Snap from camera':'使用摄像头拍照',
 'Upload video':'上传视频','Upload photo':'上传照片','Or paste a public HTTPS link':'或粘贴公开 HTTPS 链接',
 'Preparing media capture. You can cancel without saving.':'正在准备采集；可以取消，不会保存。',
 'Cancel media capture':'取消媒体采集','Cancel capture':'取消采集','Start recording':'开始录制','Stop & save':'停止并保存','Cancel':'取消',
 'Re-record':'重新录制','Remove':'移除','proof preview':'证据预览','Back to upload options':'返回上传选项',
 'Public evidence link':'公开证据链接','Evidence description':'证据说明',
 'Describe what you did. What can the other player verify?':'描述实际发生的情况，以及另一位玩家可以核实的内容。',
 'Keep the original agreed rules. Do not include passwords or private access links.':'请遵守已确认的规则，不要填写密码或私密访问链接。',
 'Submit proof':'提交证据','Uploading...':'正在上传…','Submitting...':'正在提交…','Upload progress':'上传进度','Uploading…':'正在上传…',
 'Photo evidence · image file · up to 80 MB':'照片证据 · 图片文件 · 不超过 80 MB',
 'Video evidence · video file · up to 80 MB':'视频证据 · 视频文件 · 不超过 80 MB',
 'Your own evidence · files up to 80 MB':'你自己的证据 · 文件不超过 80 MB',
 'Written evidence · describe the verifiable result':'书面证据 · 描述可核实的结果',
 'Saved to this page only; submit below to send your proof.':'当前仅保留在此页面；点击下方提交后才会发送证据。',
 'Proof files must be 80 MB or smaller. Trim the clip before uploading.':'证据文件不能超过 80 MB，请剪短视频后再上传。',
 'Use a public HTTPS link to the proof file.':'请使用不含账号密码的公开 HTTPS 证据链接。',
 'Use a valid public HTTPS link to the proof file.':'请输入有效的公开 HTTPS 证据链接。',
 'This quest requires photo proof. Choose a matching file.':'这项 Quest 要求照片证据，请选择图片文件。',
 'This quest requires video proof. Choose a matching file.':'这项 Quest 要求视频证据，请选择视频文件。',
 'This quest requires photo proof. Add a matching file or public HTTPS link.':'这项 Quest 要求照片证据，请添加图片或公开 HTTPS 链接。',
 'This quest requires video proof. Add a matching file or public HTTPS link.':'这项 Quest 要求视频证据，请添加视频或公开 HTTPS 链接。',
 'Describe what you did before submitting written proof.':'请先描述你做了什么，再提交书面证据。',
 'Add proof before submitting.':'请先添加证据再提交。',
 'Camera capture is unavailable. Upload a matching file instead.':'当前无法使用摄像头，请上传符合要求的文件。',
 'Camera capture is unavailable. Upload a photo instead.':'当前无法使用摄像头，请改为上传照片。',
 'Photo capture is unavailable. Upload a file instead.':'当前无法拍照，请改为上传文件。',
 'Could not access camera/mic. Grant permission and try again.':'无法访问摄像头或麦克风，请检查权限后重试。',
 'Video recording is unavailable. Upload a video file instead.':'当前浏览器无法录制视频，请上传已有视频。',
 'Recording ended before you chose Stop & save. No partial clip was kept.':'录制在选择“停止并保存”之前结束，未保留不完整片段。',
 'The recording was empty. Please record again or upload a video file.':'未录到有效内容，请重新录制或上传视频。',
 'Recording failed. No partial clip was kept. Try again or upload a video file.':'录制失败，未保留不完整片段。请重试或上传视频。',
 'Could not start recording. Upload a video file instead.':'无法开始录制，请改为上传视频。',
 'Could not save the recording. Try again.':'未能保存录像，请重试。',
 'The camera did not provide a photo. Try again or upload a file.':'摄像头没有返回照片，请重试或上传文件。',
 'The photo could not be saved. Try again.':'照片未能保存，请重试。','Could not take photo.':'拍照失败，请重试。',
 'The server did not confirm this proof for the current account and Quest. Your input was kept.':'服务器未确认这份证据属于当前账号和 Quest，输入已保留。',
 'Could not submit proof':'证据提交失败，请重试。',
 'Upload failed — configure Vercel Blob or S3.':'上传服务暂不可用。请稍后重试，或使用有效的公开 HTTPS 链接。',
 'Upload failed. Paste a public HTTPS URL instead.':'上传失败。你也可以改用公开 HTTPS 链接。',
};
export function proofInterfaceCopy(language:SumLanguage,text:string):string {
 if(language!=='zh')return text;
 if(copy[text])return copy[text];
 const status=text.match(/^Upload failed \((\d{3})\)\. Your proof was not submitted\.$/);
 if(status)return `上传失败（${status[1]}），证据尚未提交。`;
 return text;
}
