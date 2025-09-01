import { v2 as cloudinary } from "cloudinary";
import fs from "fs"



cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null;
    //upload file on cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    //file has been uploaded
    fs.unlinkSync(localFilePath)
    console.log("file is uploaded on cloudinary ", response.url);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); //remove the locally saved temporory file as the upload got failed
    return null;
  }
};

function extractPublicId(url) {
  const parts = url.split("/");
  const filename = parts.pop(); // "abc123.jpg"
  const folderPath = parts.slice(parts.indexOf("upload") + 1).join("/");
  const publicId = folderPath + "/" + filename.split(".")[0];
  return publicId;
}
 

export {uploadOnCloudinary,extractPublicId}
