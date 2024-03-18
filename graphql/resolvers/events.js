const User = require("../../models/User.js");
const Event = require("../../models/Event.js");
const Route = require("../../models/Route.js");
const { fetchLocation } = require('../../util/geocoder.js');


module.exports = {

    Query: {
        async getEvent(_, { eventID }) {
            const event = await Event.findOne({ _id: eventID });
            return event;
        },

        async getAllEvents() {
            const events = await Event.find();
            return events;
        },

        async getEvents(_, {
            getEventsInput: {
                page,
                pageSize,
                startDate,
                endDate,
                bikeType,
                location,
                radius,
                match,
            },
            contextValue
        }) {
            if (!contextValue.user.username) {
                throw new GraphQLError('You must be logged in to perform this action.', {
                    extensions: {
                        code: 'UNAUTHENTICATED',
                    },
                })
            }
            //check if location and/or radius is null
            let locationCoords = null;
            if(!location | !radius) {
                geoParam = await User.findOne({ username: contextValue.user.username }).select('locationCoords', 'radius');
                if (!location)
                    locationCoords = geoParam.locationCoords;
                if (!radius)
                    radius = geoParam.radius;
            }
            //if location string provided, find corresponding coords
            else if (!locationCoords){
                const fetchResult = await fetchLocation(location, null);
                locationCoords = [fetchResult.lon, fetchResult.lat];
            }
            if (!locationCoords) {
                throw new GraphQLError('Location not provided nor found in user document.', {
                    extensions: {
                        code: 'BAD_USER_INPUT'
                    }
                });
            }
            if(!page)
                page = 0;
            if(!pageSize)
                pageSize = 50;

            const events = await Event.aggregate(
                [   
                    {
                        $match: {
                            locationCoords: {
                                $geoWithin: {
                                    $centerSphere: [
                                        locationCoords,
                                        radius / 6378.1]
                                }
                            },
                            startTime: {
                                $gte: startDate,
                                $lte: endDate,
                            },
                            bikeType: {
                                $in: bikeType
                            },
                        }
                    },
                    {
                        $facet: {
                            metadata: [{ $count: 'totalCount' }],
                            data: [{ $skip: (page) * pageSize }, { $limit: pageSize }],
                        }
                    }
                ]
            );

            return events;
        },
    },

    Mutation: {
        async createEvent(_, {
            createEventInput: {
                host,
                name,
                startTime,
                description,
                bikeType,
                difficulty,
                wattsPerKilo,
                intensity,
                points,
                elevation,
                grade,
                terrain,
                distance,
                maxElevation,
                minElevation,
                totalElevationGain,
                startCoordinates,
                endCoordinates,
            },
        }) {
            host = host.toLowerCase();

            const newRoute = new Route({
                points: points,
                elevation: elevation,
                grade: grade,
                terrain: terrain,
                distance: distance,
                maxElevation: maxElevation,
                minElevation: minElevation,
                totalElevationGain: totalElevationGain,
                startCoordinates: startCoordinates,
                endCoordinates: endCoordinates,
            });
            const resRoute = await newRoute.save();

            const locFetched = await fetchLocation(null, startCoordinates);
            const locCoords = [startCoordinates[1],startCoordinates[0]];

            const newEvent = new Event({
                host: host,
                name: name,
                locationName: locFetched.display_name,
                locationCoords: locCoords,
                startTime: startTime,
                description: description,
                bikeType: bikeType,
                difficulty: difficulty,
                wattsPerKilo: wattsPerKilo,
                intensity: intensity,
                route: resRoute.id,
            });
            const resEvent = await newEvent.save();

            await User.findOneAndUpdate(
                { username: host },
                { $push: { eventsHosted: resEvent.id } },
            );
            return resEvent;
        },

        async deleteEvent(_, {
            host,
            eventID
        }) {
            const resEvent = await User.findOneAndUpdate(
                { username: host },
                { $pull: { eventsHosted: eventID }},
                { returnDocument: 'after'},
            );
            const delEvent = await Event.findOneAndDelete({ _id: eventID });
            await Route.deleteOne({ _id: delEvent.route });
            return resEvent.events;
        },

        async joinEvent(_, {
            username,
            eventID
        }) {
            const resEvent = await Event.findOneAndUpdate(
                { _id: eventID },
                { $push: { participants: username }},
                { returnDocument: 'after' },
            );
            await User.findOneAndUpdate(
                { username },
                { $push: { eventsJoined: eventID }},
            );
            return resEvent;
        },

        async leaveEvent(_, {
            username,
            eventID
        }) {
            const resEvent = await Event.findOneAndUpdate(
                { _id: eventID },
                { $pull: { participants: username }},
                { returnDocument: 'after' },
            );
            await User.findOneAndUpdate(
                { username },
                { $pull: { eventsJoined: eventID }},
            );
            return resEvent;
        }
    },
};
