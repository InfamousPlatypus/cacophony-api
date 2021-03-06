/*
cacophony-api: The Cacophony Project API server
Copyright (C) 2018  The Cacophony Project

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import e, { Application } from "express";
import middleware from "../middleware";
import auth from "../auth";
import recordingUtil, { RecordingQuery } from "./recordingUtil";
import responseUtil from "./responseUtil";
import models from "../../models";
// @ts-ignore
import * as csv from "fast-csv";
import { body, oneOf, param, query } from "express-validator/check";
import { RecordingPermission, TagMode } from "../../models/Recording";
import { TrackTag } from "../../models/TrackTag";
import { Track } from "../../models/Track";
import { Op } from "sequelize";
import jwt from "jsonwebtoken";
import config from "../../config";

export default (app: Application, baseUrl: string) => {
  const apiUrl = `${baseUrl}/recordings`;

  /**
   * @apiDefine RecordingParams
   *
   * @apiParam {JSON} data Metadata about the recording.   Valid tags are:
   * <ul>
   * <li>(REQUIRED) type: 'thermalRaw', or 'audio'
   * <li>duration
   * <li>recordingDateTime
   * <li>location
   * <li>version
   * <li>batteryCharging
   * <li>batteryLevel
   * <li>airplaneModeOn
   * <li>additionalMetadata
   * <li>comment
   * </ul>
   * @apiParam {File} file Recording file to upload
   */

  /**
   * @api {post} /api/v1/recordings Add a new recording
   * @apiName PostRecording
   * @apiGroup Recordings
   * @apiDescription Uploads a device's own raw thermal video to the server.  It currently
   * supports raw thermal video but will eventually support all recording types.
   *
   * @apiUse V1DeviceAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    [auth.authenticateDevice],
    middleware.requestWrapper(recordingUtil.makeUploadHandler())
  );

  /**
   * @api {post} /api/v1/recordings/device/:devicename/group/:groupname Add a new recording on behalf of device using group
   * @apiName PostRecordingOnBehalfUsingGroup
   * @apiGroup Recordings
   * @apiDescription Called by a user to upload raw thermal video on behalf of a device.
   * The user must have permission to view videos from the device or the call will return an
   * error.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */

  app.post(
    `${apiUrl}/device/:devicename/group/:groupname`,
    [
      auth.authenticateUser,
      middleware.setGroupName(param),
      middleware.getDevice(param),
      auth.userCanAccessDevices
    ],
    middleware.requestWrapper(recordingUtil.makeUploadHandler())
  );

  /**
   * @api {post} /api/v1/recordings/device/:deviceID Add a new recording on behalf of device
   * @apiName PostRecordingOnBehalf
   * @apiGroup Recordings
   * @apiDescription Called by a user to upload raw thermal video on behalf of a device.
   * The user must have permission to view videos from the device or the call will return an
   * error.
   *
   * @apiParam {String} deviceID ID of the device to upload on behalf of. If you don't have access to the ID the devicename can be used instead in it's place.
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */

  app.post(
    `${apiUrl}/device/:deviceID`,
    [
      auth.authenticateUser,
      middleware.getDevice(param, "deviceID"),
      auth.userCanAccessDevices
    ],
    middleware.requestWrapper(recordingUtil.makeUploadHandler())
  );

  const queryValidators = Object.freeze([
    middleware.parseJSON("where", query).optional(),
    query("offset")
      .isInt()
      .optional(),
    query("limit")
      .isInt()
      .optional(),
    middleware.parseJSON("order", query).optional(),
    middleware.parseArray("tags", query).optional(),
    query("tagMode")
      .optional()
      .custom(value => {
        return models.Recording.isValidTagMode(value);
      }),
    middleware.parseJSON("filterOptions", query).optional()
  ]);

  /**
   * @api {post} /api/v1/recordings/:devicename Legacy upload on behalf of
   * @apiName PostRecordingOnBehalfLegacy
   * @apiGroup Recordings
   * @apiDeprecated use now (#Recordings:PostRecordingOnBehalf)
   *
   * @apiDescription Called by a user to upload raw thermal video on
   * behalf of a device. This endpoint can only be used if a device's
   * name is unique across all groups. It should not be used for new code.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse RecordingParams
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl + "/:devicename",
    [
      auth.authenticateUser,
      middleware.getDevice(param),
      auth.userCanAccessDevices
    ],
    middleware.requestWrapper(recordingUtil.makeUploadHandler())
  );

  /**
   * @api {get} /api/v1/recordings Query available recordings
   * @apiName QueryRecordings
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse BaseQueryParams
   * @apiUse RecordingOrder
   * @apiUse MoreQueryParams
   * @apiUse FilterOptions
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl,
    [auth.authenticateUser, ...queryValidators],
    middleware.requestWrapper(
      async (request: e.Request, response: e.Response) => {
        const result = await recordingUtil.query(
          (request as unknown) as RecordingQuery
        );
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Completed query."],
          limit: request.query.limit,
          offset: request.query.offset,
          count: result.count,
          rows: result.rows
        });
      }
    )
  );

  /**
   * @api {get} /api/v1/recordings/count Query available recording count
   * @apiName QueryRecordingsCount
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse BaseQueryParams
   * @apiUse MoreQueryParams
   * @apiUse FilterOptions
   * @apiUse V1ResponseSuccessQuery
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/count`,
    [auth.authenticateUser, ...queryValidators],
    middleware.requestWrapper(
      async (request: RecordingQuery, response: e.Response) => {
        const user = request.user;
        const countQuery = {
          where: {
            [Op.and]: [
              request.query.where // User query
            ]
          },
          include: [
            {
              model: models.Group,
              include: [
                {
                  model: models.User,
                  where: {
                    [Op.and]: [{ id: user.id }]
                  }
                }
              ],
              required: true
            }
          ]
        };
        if (user.hasGlobalRead()) {
          // Dont' filter on user if the user has global read permissons.
          delete countQuery.include[0].include;
        }
        const count = await models.Recording.count(countQuery);
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Completed query."],
          count
        });
      }
    )
  );

  /**
   * @api {get} /api/v1/recordings/needs-tag Get a random recording that needs
   * human tagging applied.
   * @apiName NeedsTag
   * @apiGroup Recordings
   * @apiDescription Parameters are as per GET /api/V1/recordings. On
   * success (status 200), the response body will contain JSON
   * formatted details of the selected recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {number} [deviceId] Optional deviceId to bias returned recording to.
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/needs-tag`,
    [
      auth.authenticateUser,
      query("deviceId")
        .isInt()
        .toInt()
        .optional()
    ],
    middleware.requestWrapper(
      async (request: e.Request, response: e.Response) => {
        // NOTE: We only return the minimum set of fields we need to play back
        //  a recording, show tracks in the UI, and have the user add a tag.
        //  Generate a short-lived JWT token for each recording we return, keyed
        //  to that recording.  Only return a single recording at a time.
        //
        let result;
        if (!request.query.deviceId) {
          result = await models.Recording.getRecordingWithUntaggedTracks();
        } else {
          // NOTE: Optionally, the returned recordings can be biased to be from
          //  a preferred deviceId, to handle the case where we'd like a series
          //  of random recordings to tag constrained to a single device.
          result = await models.Recording.getRecordingWithUntaggedTracks(
            request.query.deviceId
          );
        }
        responseUtil.send(response, {
          statusCode: 200,
          messages: ["Completed query."],
          rows: [result]
        });
      }
    )
  );

  /**
   * @api {get} /api/v1/recordings/report Generate report for a set of recordings
   * @apiName Report
   * @apiGroup Recordings
   * @apiDescription Parameters are as per GET /api/V1/recordings. On
   * success (status 200), the response body will contain CSV
   * formatted details of the selected recordings.
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiParam {String} [jwt] Signed JWT as produced by the [Token](#api-Authentication-Token) endpoint
   * @apiUse BaseQueryParams
   * @apiUse RecordingOrder
   * @apiUse MoreQueryParams
   * @apiUse FilterOptions
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/report`,
    [auth.paramOrHeader, ...queryValidators],
    middleware.requestWrapper(async (request, response) => {
      // 10 minute timeout because the query can take a while to run
      // when the result set is large.
      request.setTimeout(10 * 60 * 1000);
      const rows = await recordingUtil.report(request);
      response.status(200).set({
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=recordings.csv"
      });
      csv.writeToStream(response, rows);
    })
  );

  /**
   * @api {get} /api/v1/recordings/:id Get a recording
   * @apiName GetRecording
   * @apiGroup Recordings
   *
   * @apiUse MetaDataAndJWT
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse FilterOptions
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} fileSize the number of bytes in recording file.
   * @apiSuccess {int} rawSize the number of bytes in raw recording file.
   * @apiSuccess {String} downloadFileJWT JSON Web Token to use to download the
   * recording file.
   * @apiSuccess {String} downloadRawJWT JSON Web Token to use to download
   * the raw recording data.
   * @apiSuccess {JSON} recording The recording data.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id`,
    [
      auth.authenticateUser,
      param("id").isInt(),
      middleware.parseJSON("filterOptions", query).optional()
    ],
    middleware.requestWrapper(async (request, response) => {
      const {
        recording,
        rawSize,
        rawJWT,
        cookedSize,
        cookedJWT
      } = await recordingUtil.get(request);

      responseUtil.send(response, {
        statusCode: 200,
        messages: [],
        recording: recording,
        rawSize: rawSize,
        fileSize: cookedSize,
        downloadFileJWT: cookedJWT,
        downloadRawJWT: rawJWT
      });
    })
  );

  /**
   * @api {delete} /api/v1/recordings/:id Delete an existing recording
   * @apiName DeleteRecording
   * @apiGroup Recordings
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id`,
    [auth.authenticateUser, param("id").isInt()],
    middleware.requestWrapper(async (request, response) => {
      return recordingUtil.delete_(request, response);
    })
  );

  /**
   * @api {patch} /api/v1/recordings/:id Update an existing recording
   * @apiName UpdateRecording
   * @apiGroup Recordings
   * @apiDescription This call is used for updating fields of a previously
   * submitted recording.
   *
   * The following fields that may be updated are:
   * - location
   * - comment
   * - additionalMetadata
   *
   * If a change to any other field is attempted the request will fail and no
   * update will occur.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {JSON} updates Object containing the fields to update and their new values.
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.patch(
    `${apiUrl}/:id`,
    [
      auth.authenticateUser,
      param("id").isInt(),
      middleware.parseJSON("updates", body)
    ],
    middleware.requestWrapper(async (request, response) => {
      const updated = await models.Recording.updateOne(
        request.user,
        request.params.id,
        request.body.updates
      );

      if (updated) {
        return responseUtil.send(response, {
          statusCode: 200,
          messages: ["Updated recording."]
        });
      } else {
        return responseUtil.send(response, {
          statusCode: 400,
          messages: ["Failed to update recordings."]
        });
      }
    })
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks Add new track to recording
   * @apiName PostTrack
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {number} id Id of the recording to add the track to.
   * @apiParam {JSON} data Data which defines the track (type specific).
   * @apiParam {JSON} algorithm (Optional) Description of algorithm that generated track
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackId Unique id of the newly created track.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks`,
    [
      auth.authenticateUser,
      param("id")
        .isInt()
        .toInt(),
      middleware.parseJSON("data", body),
      middleware.parseJSON("algorithm", body).optional()
    ],
    middleware.requestWrapper(async (request, response) => {
      const recording = await models.Recording.get(
        request.user,
        request.params.id,
        RecordingPermission.UPDATE
      );
      if (!recording) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such recording."]
        });
        return;
      }

      const algorithm = request.body.algorithm
        ? request.body.algorithm
        : "{'status': 'User added.'";
      const algorithmDetail = await models.DetailSnapshot.getOrCreateMatching(
        "algorithm",
        algorithm
      );

      const track = await recording.createTrack({
        data: request.body.data,
        AlgorithmId: algorithmDetail.id
      });
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track added."],
        trackId: track.id
      });
    })
  );

  /**
   * @api {get} /api/v1/recordings/:id/tracks Get tracks for recording
   * @apiName GetTracks
   * @apiGroup Tracks
   * @apiDescription Get all tracks for a given recording and their tags.
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {JSON} tracks Array with elements containing id,
   * algorithm, data and tags fields.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    `${apiUrl}/:id/tracks`,
    [auth.authenticateUser, param("id").isInt()],
    middleware.requestWrapper(async (request, response) => {
      const recording = await models.Recording.get(
        request.user,
        request.params.id,
        RecordingPermission.VIEW
      );
      if (!recording) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such recording."]
        });
        return;
      }

      const tracks = await recording.getActiveTracksTagsAndTagger();
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["OK."],
        tracks: tracks.map(t => {
          delete t.dataValues.RecordingId;
          return t;
        })
      });
    })
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId Remove track from recording
   * @apiName DeleteTrack
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   *
   */
  app.delete(
    `${apiUrl}/:id/tracks/:trackId`,
    [
      auth.authenticateUser,
      param("id")
        .isInt()
        .toInt(),
      param("trackId")
        .isInt()
        .toInt()
    ],
    middleware.requestWrapper(async (request, response) => {
      const track = await loadTrack(request, response);
      if (!track) {
        return;
      }
      await track.destroy();
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track deleted."]
      });
    })
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/replaceTag  Adds/Replaces  a Track Tag
   * @apiDescription Adds or Replaces track tag based off:
   * if tag already exists for this user, ignore request
   * Add tag if it is an additional tag e.g. :Part"
   * Add tag if this user hasn't already tagged this track
   * Replace existing tag, if user has an existing animal tag
   * @apiName PostTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} what Object/event to tag.
   * @apiParam {Number} confidence Tag confidence score.
   * @apiParam {Boolean} automatic "true" if tag is machine generated, "false" otherwise.
   * @apiParam {JSON} data Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/replaceTag`,
    [
      auth.authenticateUser,
      param("id")
        .isInt()
        .toInt(),
      param("trackId")
        .isInt()
        .toInt(),
      body("what"),
      body("confidence")
        .isFloat()
        .toFloat(),
      body("automatic")
        .isBoolean()
        .toBoolean(),
      middleware.parseJSON("data", body).optional()
    ],
    middleware.requestWrapper(async (request, response) => {
      const newTag = models.TrackTag.build({
        what: request.body.what,
        confidence: request.body.confidence,
        automatic: request.body.automatic,
        data: request.body.data ? request.body.data : "",
        UserId: request.user.id,
        TrackId: request.params.trackId
      }) as TrackTag;

      await models.Track.replaceTag(request.params.trackId, newTag);
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag added."],
        trackTagId: newTag.id
      });
    })
  );

  /**
   * @api {post} /api/v1/recordings/:id/tracks/:trackId/tags Add tag to track
   * @apiName PostTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {String} what Object/event to tag.
   * @apiParam {Number} confidence Tag confidence score.
   * @apiParam {Boolean} automatic "true" if tag is machine generated, "false" otherwise.
   * @apiParam {JSON} data Data Additional tag data.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {int} trackTagId Unique id of the newly created track tag.
   *
   * @apiUse V1ResponseError
   *
   */
  app.post(
    `${apiUrl}/:id/tracks/:trackId/tags`,
    [
      auth.authenticateUser,
      param("id")
        .isInt()
        .toInt(),
      param("trackId")
        .isInt()
        .toInt(),
      body("what"),
      body("confidence")
        .isFloat()
        .toFloat(),
      body("automatic")
        .isBoolean()
        .toBoolean(),
      body("tagJWT")
        .optional()
        .isString(),
      middleware.parseJSON("data", body).optional()
    ],
    middleware.requestWrapper(async (request, response) => {
      let track;
      if (request.body.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users' recording
        // update permissions.
        track = await loadTrackForTagJWT(request, response);
      } else {
        // Otherwise, just check that the user can update this track.
        track = await loadTrack(request, response);
        if (!track) {
          responseUtil.send(response, {
            statusCode: 401,
            messages: ["Track not found"]
          });
          return;
        }
      }
      const tag = await track.createTrackTag({
        what: request.body.what,
        confidence: request.body.confidence,
        automatic: request.body.automatic,
        data: request.body.data ? request.body.data : "",
        UserId: request.user.id
      });
      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag added."],
        trackTagId: tag.id
      });
    })
  );

  /**
   * @api {delete} /api/v1/recordings/:id/tracks/:trackId/tags/:trackTagId Delete a track tag
   * @apiName DeleteTrackTag
   * @apiGroup Tracks
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiUse V1ResponseSuccess
   * @apiUse V1ResponseError
   */
  app.delete(
    `${apiUrl}/:id/tracks/:trackId/tags/:trackTagId`,
    [
      auth.authenticateUser,
      param("id")
        .isInt()
        .toInt(),
      param("trackId")
        .isInt()
        .toInt(),
      param("trackTagId")
        .isInt()
        .toInt(),
      query("tagJWT")
        .isString()
        .optional()
    ],
    middleware.requestWrapper(async (request, response) => {
      let track;
      if (request.query.tagJWT) {
        // If there's a tagJWT, then we don't need to check the users' recording
        // update permissions.
        track = await loadTrackForTagJWT(request, response);
      } else {
        // Otherwise, just check that the user can update this track.
        track = await loadTrack(request, response);
        if (!track) {
          responseUtil.send(response, {
            statusCode: 401,
            messages: ["Track not found"]
          });
          return;
        }
      }

      const tag = await track.getTrackTag(request.params.trackTagId);
      if (!tag) {
        responseUtil.send(response, {
          statusCode: 400,
          messages: ["No such track tag."]
        });
        return;
      }

      await tag.destroy();

      responseUtil.send(response, {
        statusCode: 200,
        messages: ["Track tag deleted."]
      });
    })
  );

  async function loadTrackForTagJWT(request, response): Promise<Track> {
    let jwtDecoded;
    const tagJWT = request.body.tagJWT || request.query.tagJWT;
    try {
      jwtDecoded = jwt.verify(tagJWT, config.server.passportSecret);
      if (
        jwtDecoded._type === "tagPermission" &&
        jwtDecoded.recordingId === request.params.id
      ) {
        const track = await models.Track.findByPk(request.params.trackId);
        if (!track) {
          responseUtil.send(response, {
            statusCode: 401,
            messages: ["Track does not exist"]
          });
          return;
        }
        // Ensure track belongs to this recording.
        if (track.RecordingId !== request.params.id) {
          responseUtil.send(response, {
            statusCode: 401,
            messages: ["Track does not belong to recording"]
          });
          return;
        }
        return track;
      } else {
        responseUtil.send(response, {
          statusCode: 401,
          messages: ["JWT does not have permissions to tag this recording"]
        });
        return;
      }
    } catch (e) {
      console.log(e, jwtDecoded);
      responseUtil.send(response, {
        statusCode: 401,
        messages: ["Failed to verify JWT."]
      });
      return;
    }
  }

  async function loadTrack(request, response): Promise<Track> {
    const recording = await models.Recording.get(
      request.user,
      request.params.id,
      RecordingPermission.UPDATE
    );
    if (!recording) {
      responseUtil.send(response, {
        statusCode: 400,
        messages: ["No such recording."]
      });
      return;
    }

    const track = await recording.getTrack(request.params.trackId);
    if (!track) {
      responseUtil.send(response, {
        statusCode: 400,
        messages: ["No such track."]
      });
      return;
    }

    return track;
  }
};
