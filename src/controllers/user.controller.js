import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import { uploadOnCloudinary,extractPublicId } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";




const generateAccessAndRefreshTokens = async(userId)=>{
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave:false});

        return {accessToken,refreshToken}
    } catch (error) {
        throw new ApiError(500,"Something went wrong while generating acces and refresh token")
    }
}

const registerUser = asyncHandler( async(req,res)=>{
    //get user details from frontend
    // validation
    // check if user alraedy exist:username and email
    //check for images check for avtar
    //upload them to cloudinary,avtar
    //craete user objects - create entry in db
    //remove password and refresh token feild from response
    //check from user creation
    // return res

    const {fullName,email,username,password} = req.body;

    console.log("email:",email);


    if([fullName,email,username,password].some((field)=>
    field?.trim()==="")){
        throw new ApiError(400,"All feilds are required")
    }



    const existedUser = await User.findOne({
        $or:[{username},{email}]
    })


    if(existedUser){
        throw new ApiError(409,"User with email or username already exists")
    }

    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    let coverImageLocalPath;
    if(req.files&&Array.isArray(req.files.coverImage)&&req.files.coverImage.length>0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)


    if(!avatar){
        throw new ApiError(400, "Avatar upload failed");
    }

    const user = await User.create({
        fullName,
        avatar:avatar.url,
        coverImage:coverImage?.url||"",
        email,
        password,
        username:username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    if(!createdUser){
        throw new ApiError(500,"Something went wrong while regestring user");
    }


    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered Succesfully")
    )




})


const loginUser = asyncHandler(async(req,res)=>{
     //req body -> data
     //username or email
     //find the user
     //password check
     //access refresh token generation
     //send cookie
     const {email,username,password} = req.body;

     if(!username&&!email){
        throw new ApiError(400,"username or email is required")
     }

     const user = await User.findOne({
        $or:[{username},{email}]
     })

     if(!user){
        throw new ApiError(404,"User does not exist")
     }

     const isPasswordValid = await user.isPasswordCorrect(password)

     if (!isPasswordValid) {
          throw new ApiError(401, "Invalid user credintials");
     }

     const {accessToken,refreshToken} = await generateAccessAndRefreshTokens(user._id);

     const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

     const options = {
        httpOnly:true,
        secure: true

     }

     return res.status(200).cookie("accessToken",accessToken,options).cookie("refreshToken",refreshToken,options)
     .json(
        new ApiResponse(
            200,
            {
                user:loggedInUser,accessToken,
                refreshToken
            },
            "User logged in successfully"
        )
     )


})

const logoutUser = asyncHandler(async(req,res)=>{
     await User.findByIdAndUpdate(
        req.user._id,
        {
            $set:{
                refreshToken:undefined
            }
        },
        {
            new:true
        }
     )

     const options = {
       httpOnly: true,
       secure: true,
     };

     return res.status(200).clearCookie("accessToken",options).clearCookie("refreshToken",options).json(new ApiResponse(200,{},"User logged Out"))
})

const refreshAccessToken = asyncHandler(async(req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken||req.body.refreshToken

    if(!incomingRefreshToken){
          throw new ApiError(401,"Unoauthorized access")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
    
       const user = await  User.findById(decodedToken?._id)
    
        if (!user) {
          throw new ApiError(401, "Invalid refresh token");
        }
    
        if(incomingRefreshToken!==user?.refreshToken){
            throw new ApiError(401, "refresh token is expired or used");
        }
    
        const options = {
            httpOnly:true,
            secure:true,
        }
    
        const {newaccessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res
        .status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,{
                   accessToken,refreshToken:newRefreshToken
                },
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401,error?.message||"Inavlid refresh token")
    }

})


const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword,newPassword} = req.body;
    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400,"Inavlid old password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave:false});

    return res.status(200)
    .json(new ApiResponse(200,{},"Password changed Succesfully"))
})


const getCurrentUser = asyncHandler(async(req,res)=>{
    return res.status(200).json( new ApiResponse(200,req.user,"Current user fetched succesfully"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName,email} = req.body;

    if(!fullName||!email){
        throw new ApiError(400,"All feilds are required")
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
           $set:{
            fullName,
            email
           }
        },
        {new:true}
    ).select("-password")

    return res.status(200).json(new ApiResponse(200,user,"Account detail udpated successfully"))

    
})


const updateUserAvatar = asyncHandler(async(req,res)=>{
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // 1. Find user
  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // 2. Delete old image if exists
  if (user.avatar) {
    const publicId = extractPublicId(user.avatar); // use OLD avatar url from DB
    await cloudinary.uploader.destroy(publicId);
  }

  // 3. Upload new image
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  // 4. Update user
  user.avatar = avatar.url;
  await user.save();

  return res
    .status(200)
    .json(new ApiResponse(200, user, "avatar image updated succesfully"));
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "CoverImage file is missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading CoverImage");
  }

  const user  = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    { new: true }
  ).select("-password");

  return res.status(200).json(new ApiResponse(200,user,"Cover image updated succesfully"))
});

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const  {username} = req.params;

    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }

    const channel = await User.aggregate([
      {
        $match: {
          username: username?.toLowerCase(),
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "channel",
          as: "subscribers",
        },
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "_id",
          foreignField: "subscriber",
          as: "subscribedTo",
        },
      },
      {
        $addFields: {
          subscriberCount: {
            $size: "$subscribers",
          },
          channelSubscribedToCount: {
            $size: "$subscribedTo",
          },
          isSubscribed: {
            $cond: {
              if: { $in: [req.user?._id, "$subscribers.subscriber"] },
              then: true,
              else: false,
            },
          },
        },
      },
      {
        $project: {
          fullName: 1,
          username: 1,
          subscriberCount: 1,
          channelSubscribedToCount: 1,
          isSubscribed:1,
          avatar:1,
          coverImage:1,
          email:1,
        },
      },
    ]);


    if(!channel?.length){
        throw new ApiError(404,"channel does not exits")
    }

    return res.status(200).json(
        new ApiResponse(200,channel[0],"User channel fetched succesfully")
    )





    


})

const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id:new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName:1,
                                        username:1,
                                        avatar:1,
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first:"$owner"
                            }
                        }
                    }
                ]
            }

        }
    ])

    return res.status(200).json(new ApiResponse(200, user[0].watchHistory,"Watchhistory fetched successfully"));
})



export {registerUser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,getCurrentUser,updateAccountDetails,updateUserAvatar,updateUserCoverImage,getUserChannelProfile,getWatchHistory}