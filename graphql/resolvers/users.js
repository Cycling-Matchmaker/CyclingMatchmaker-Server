const GraphQLError = require('graphql').GraphQLError;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
    handleInputError,
    handleGeneralError,
  } = require("../../util/error-handling");

const {
    validateRegisterInput,
    validateLoginInput,
    validateUsername,
    validateEmail,
} = require('../../util/validators');
  
const { fetchLocation } = require('../../util/geocoder.js');

const User = require("../../models/User.js");

require("dotenv").config();

function generateToken(user, time) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        permission: user.permission,
      },
      process.env.SECRET,
      {
        expiresIn: time,
      }
    );
  }

/*
This function checks if a user's strava token has expired.
If the token has expired, a new token will be requested from strava
and the respective fields in the user document will be updated.
Returns the strava expiration date.
*/
async function checkStravaToken(username) {
    //check for token expiry
    try {
        const user = await User.findOne({ username }).select('stravaRefreshToken', 'stravaTokenExpiration');
        if (user.stravaTokenExpiration < new Date()) {
            //token has expired, request new one
            return refreshStravaToken(username, user.stravaRefreshToken);
        }
    } catch (error) {
        handleGeneralError(error, "User not found.");
    }
}
async function refreshStravaToken(username, refreshToken) {
    try {
        const queryParams = new URLSearchParams({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        });
        
        const response = await fetch(`https://www.strava.com/oauth/token?${queryParams}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ key: 'value' }),
        });

        const responseData = await response.json();
        const APIToken = responseData.access_token;
        const refreshToken = responseData.refresh_token;
        const tokenExpiration = new Date(responseData.expires_at).toISOString();
        const user = await User.findOneAndUpdate(
            {username: username},
            {
                stravaAPIToken: APIToken,
                stravaRefreshToken: refreshToken,
                stravaTokenExpiration: tokenExpiration 
            }
        );
        return tokenExpiration;
    } catch (error) {
        throw new GraphQLError(err, {
            extensions: {
                code: 'Internal Server Error'
            }
        })
    }
    return null;
}
module.exports = {
    Query: {
        async getUser(_, { username }) {
            try {
                const user = await User.findOne({ username });
                return user;
            } catch (error) {
                handleGeneralError(error, "User not found.");
            }
        },

        async getUsers() {
            try {
                const users = await User.find();
                return users;
            } catch (error) {
                handleGeneralError(error, "Users not found.");
            }
        },

        async validUsername(_, { username }) {
            const user = await User.findOne({ username: username.toLowerCase() });
            if (user) return false;

            const { valid, errors } = validateUsername(username);
            if (!valid) {
                handleInputError(errors);
            }
            return true;
        },

        async validEmail(_, { email }) {
            const user = await User.findOne({ email: email.toLowerCase() });
            if (user) return false;

            const { valid, errors } = validateEmail(email);
            if (!valid) {
                handleInputError(errors);
            }
            return true;
        },
        async requestStravaAuthorization(_, __, contextValue) {
            //check auth for user
            if (!contextValue.user) {
                throw new GraphQLError('You must be logged in to perform this action.', {
                    extensions: {
                        code: 'UNAUTHENTICATED',
                    },
                })
            }
            //construct oauth url
            const queryParams = new URLSearchParams({
                client_id: process.env.STRAVA_CLIENT_ID,
                redirect_uri: process.env.CLIENT_URI + '/redirect',
                scope: 'activity:read_all,profile:read_all',
                response_type: 'code',
                approval_prompt: 'auto'
            })

            return `https://www.strava.com/oauth/authorize?${queryParams}`
        }
    },

    Mutation: {
        async register(_, {
            registerInput: {
                username,
                email,
                password,
                confirmPassword,
                firstName,
                lastName,
                sex,
                birthday,
                weight,
                metric,
            },
        }) {
            firstName = firstName.trim();
            lastName = lastName.trim();
            email = email.toLowerCase();
            username = username.toLowerCase();

            const { valid, errors } = validateRegisterInput(
                username,
                email,
                password,
                confirmPassword,
                firstName,
                lastName,
                sex,
                birthday,
                weight,
                metric,
            )

            if (!valid) {
                handleInputError(errors);
            }

            const usernameCheck = await User.findOne({ username });
            if (usernameCheck) {
                errors.general = "An account with that username already exists.";
                handleInputError(errors);
            }
    
            const emailCheck = await User.findOne({ email });
            if (emailCheck) {
                errors.general = "An account with that e-mail already exists.";
                handleInputError(errors);
            }

            password = await bcrypt.hash(password, 12);

            const newUser = new User({
                username: username,
                email: email,
                password: password,
                firstName: firstName,
                lastName: lastName,
                sex: sex,
                birthday: birthday,
                weight: weight,
                metric: metric,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                permission: "member",
                gear: [],
                eventsHosted: [],
                eventsJoined: [],
                locationName: "Gainesville, FL",
                locationCoords: [-82.355659, 29.643946],
                radius: 30,
            });
            const res = await newUser.save();

            const loginToken = generateToken(newUser, "24h");

            return {
                ...res._doc,
                id: res._id,
                loginToken,
            };
        },

        async login(_, { 
            loginInput: {
                username,
                password,
                remember,
            },
        }) {
            username = username.toLowerCase();
            const { errors, valid } = validateLoginInput(username, password);

            if (!valid) {
                handleInputError(errors);
            }

            const user = await User.findOne({ username });
            if (!user) {
                errors.general = "User not found.";
                handleInputError(errors);
            }

            const passwordCheck = await bcrypt.compare(password, user.password);
            if (!passwordCheck) {
              errors.general = "Wrong credentials.";
              handleInputError(errors);
            }

            time = remember === "true" || remember === true ? "30d" : "24h";
            const loginToken = generateToken(user, time);

            return {
                ...user._doc,
                id: user._id,
                loginToken,
            };
        },

        /*
        Front-end should cache all unique calls to this function. If calling for the first time, 
        include just these arguments: USERNAME, LOCATIONNAME. If calling on a cached query, 
        include these arguments, which should be pulled from the storage on the front end. 
        Arguments: USERNAME, LOCATIONCOORDS, LOCATIONNAME. If you want to change radius, it can
        be included in any combination of the function call, even just by itself. Don't forget
        to include the username for all function calls.
         */
        async setRegion(_, {
            setRegionInput: {
                username,
                locationCoords,
                locationName,
                radius,
            }
        }) {
            var name;
            var coords;

            if (locationCoords) {
                name = locationName;
                coords = locationCoords;
            } else if (locationName) {
                const fetchedData = await fetchLocation(locationName, null);
                name = fetchedData.display_name;
                coords = [fetchedData.lon, fetchedData.lat];
            }

            const updatedUser = await User.findOneAndUpdate(
                { username },
                {
                    locationName: name,
                    locationCoords: coords,
                    radius: radius,
                },
                { returnDocument: 'after'},
            );
            return updatedUser;
        },

        async addGear(_, {
            addGearInput: {
                username,
                type,
                subtype,
                make,
                model,
                weight,
                distance,
            },
        }) {
            const newGear = {
                type,
                subtype,
                make,
                model,
                weight,
                distance,
            };
            const res = await User.findOneAndUpdate(
                { username },
                { $push: { equipment: newGear } },
                { returnDocument: 'after' },
            );
            return res.equipment;
        },

        async removeGear(_, {
            username,
            gearID,
        }) {
            const res = await User.findOneAndUpdate(
                { username },
                { $pull: { equipment: { _id: gearID } } },
                { returnDocument: 'after'},
            );
            return res.equipment;
        },

        async exchangeStravaAuthorizationCode(_,
            {
                code,
                scope
            },
            contextValue)
        {
            //check user auth
            if(!contextValue.user.username) {
                throw new GraphQLError('You must be logged in to perform this action.', {
                    extensions: {
                        code: 'UNAUTHENTICATED',
                    },
                })
            }
            //check that scope is what we need
            const scopeArray = scope.split(',');
            if (!scopeArray.includes('activity:read_all') || !scopeArray.includes('profile:read_all')) {
                throw new GraphQLError('Scope does not include correct permissions.', {
                    extensions: {
                        code: 'BAD_USER_INPUT'
                    }
                });
            }
            //exchange tokens with Strava
            const queryParams = new URLSearchParams({
                client_id: process.env.STRAVA_CLIENT_ID,
                client_secret: process.env.STRAVA_CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code'
            });
            
            try {
                const response = await fetch(`https://www.strava.com/oauth/token?${queryParams}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ key: 'value' }),
                });

                const responseData = await response.json();
                const APIToken = responseData.access_token;
                const refreshToken = responseData.refresh_token;
                const tokenExpiration = new Date(responseData.expires_at).toISOString();
                //store user's access
                const user = await User.findOneAndUpdate(
                    {username: contextValue.user.username},
                    {
                        stravaAPIToken: APIToken,
                        stravaRefreshToken: refreshToken,
                        stravaTokenExpiration: tokenExpiration 
                    }
                )
                return user;
            } catch(err) {
                throw new GraphQLError(err, {
                    extensions: {
                        code: 'Internal Server Error'
                    }
                })
            }
            return null;
        },
    }
};
