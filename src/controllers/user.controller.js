import {asyncHandler} from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";



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
     const {email,username,password} = req.body

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

     const loggedInUser = await User.findById(user._id).select("-password, -refreshToken");

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



export {registerUser,loginUser,logoutUser}