const gql = require('graphql-tag');

module.exports = gql`

    ##  MAIN MODELS

    ## User Model
    type User {
        id: ID!
        username: String!
        email: String!
        password: String!
        firstName: String!
        lastName: String!
        sex: String!
        birthday: String!
        weight: Int!
        metric: Boolean!
        FTP: Float
        FTPdate: String
        equipment: [Gear]
        loginToken: String
        stravaAPIToken: String
        stravaRefreshToken: String
        eventsHosted: [String]
        eventsJoined: [String]
        createdAt: String!
        lastLogin: String!
        emailAuthenticated: String
    }

    ## User/Gear Aux Model
    type Gear {
        id: ID!
        type: String!
        subtype: String
        make: String!
        model: String!
        weight: Int!
        distance: Float!
    }

    ## Event Model
    type Event {
        id: ID!
        host: String!
        name: String!
        startTime: String!
        description: String
        bikeType: String!
        difficulty: String!
        wattsPerKilo: Float!
        intensity: String!
        route: String!
        participants: [String]
    }

    ## Event/Route Aux Model
    type Route {
        points: [[Float]]!
        elevation: [Float]!
        grade: [Float]!
        terrain: [String]!
        distance: Float!
        maxElevation: Float!
        minElevation: Float!
        totalElevationGain: Float!
        startCoordinates: [Float]!
        endCoordinates: [Float]!
    }

    ## INPUT MODELS
    input RegisterInput {
        username: String!
        email: String!
        password: String!
        confirmPassword: String!
        firstName: String!
        lastName: String!
        sex: String!
        birthday: String!
        weight: Int!
        metric: Boolean!
    }

    input LoginInput {
        username: String!
        password: String!
        remember: String!
    }

    input AddGearInput {
        username: String!
        type: String!
        subtype: String
        make: String!
        model: String!
        weight: Int!
        distance: Float!
    }

    input CreateEventInput {
        # Event Input
        host: String!
        name: String!
        startTime: String!
        description: String
        bikeType: String!
        difficulty: String!
        wattsPerKilo: Float!
        intensity: String!

        # Route Input
        points: [[Float]]!
        elevation: [Float]!
        grade: [Float]!
        terrain: [String]!
        distance: Float!
        maxElevation: Float!
        minElevation: Float!
        totalElevationGain: Float!
        startCoordinates: [Float]!
        endCoordinates: [Float]!
    }

    ## QUERY LIST
    type Query {
        # Users
        getUser(username: String!): User!
        getUsers: [User]!
        requestStravaAuthorization(): String!
        # Events
        getEvent(eventID: String!): Event!
        getEvents: [Event]!
    }

    ## MUTATION LIST
    type Mutation {
        # Users
        register(registerInput: RegisterInput): User!
        login(loginInput: LoginInput): User!
        addGear(addGearInput: AddGearInput): [Gear]!
        removeGear(username: String!, gearID: String!): [Gear]!
        exchangeStravaAuthorizationCode(code: String!, scope: String!): User!
        # Events
        createEvent(createEventInput: CreateEventInput!): Event!
        deleteEvent(host: String!, eventID: String!): [Event]!
        joinEvent(username: String!, eventID: String!): Event!
        leaveEvent(username: String!, eventID: String!): Event!
    }
`
