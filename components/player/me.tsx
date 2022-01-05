import { useEffect, useRef, memo } from 'react'
import { fromEvent } from 'rxjs'
import { map, filter, scan, auditTime } from 'rxjs/operators'

import Webcam from '../rtc/webcam'

import { useRecoilState, useSetRecoilState } from 'recoil'
import { mePositionState, myLatencyState } from '../../store/atom'

import { Vector, move, keyPressWASD } from '../../libs/movement'
import { Logger, checkMobileDevice } from '../../libs/helper'
import { playerDiameter } from '../../libs/constant'

import type { Socket } from 'socket.io-client'
import type { Boundary, Position } from '../../types'

interface CurrentPositionAndDirection {
    currPos: Vector
    dir: Vector
}

// Stop player from stepping out of borders
const boundaryProcess = (currPosAndDir: CurrentPositionAndDirection, boundary: Boundary) => {
    const { currPos } = currPosAndDir
    let collided = false

    if (currPos.x < boundary.left) {
        currPos.x = boundary.left
        collided = true
    }

    if (currPos.x > boundary.right - playerDiameter) {
        currPos.x = boundary.right - playerDiameter
        collided = true
    }

    if (currPos.y < boundary.top) {
        currPos.y = boundary.top
        collided = true
    }

    if (currPos.y > boundary.bottom - playerDiameter) {
        currPos.y = boundary.bottom - playerDiameter
        collided = true
    }

    return {
        collided,
        ...currPosAndDir,
    }
}

const Me = ({
    id,
    name,
    avatar,
    initPos,
    socket,
    channel,
    boundary,
}: {
    id: string,
    name: string
    avatar: string
    initPos: Position
    socket: Socket
    channel: string
    boundary: Boundary
}) => {
    const refContainer = useRef<HTMLDivElement>(null)

    const setMePositionState = useSetRecoilState(mePositionState)
    const [myLatency, setMyLatency] = useRecoilState(myLatencyState);

    useEffect(() => {
        const log = new Logger('Me', 'color: white; background: green')

        // default position
        const POS = new Vector(initPos.x || 0, initPos.y || 0)

        // Redraw UI
        const renderPosition = (p: Position) => {
            if (refContainer.current) {
                refContainer.current.setAttribute(
                    'style',
                    `transform: translate3d(${p.x}px, ${p.y}px, 0);`
                )
            }
        }

        const isMobile = checkMobileDevice()

        if (!isMobile) {
            // initial position
            renderPosition(POS)
        }

        // Answer server query, when other mates go online, server will ask others' states,
        // this is the response
        socket.on('ask', () => {
            log.log('[ask], response as', name, 'avatar:', avatar)
            socket.emit('sync', { id, name, pos: POS, avatar: avatar })
        })

        // Send `ping` event to server
        socket.emit('ping', { timestamp:  Date.now()})
        // Then re-end `ping` event in every 5s.
        setInterval(() => {
            socket.emit('ping', { timestamp:  Date.now()})
        }, 5000)

        // Receive `pong` event and calculate the latency.
        socket.on('pong', (payload) => {
            if (payload && payload.timestamp) {
                const rtt = Date.now() - payload.timestamp
                const latency = rtt / 2
                setMyLatency({
                    latency,
                    mesh_id: payload.mesh_id,
                })
                socket.emit('latency', {
                    latency,
                    mesh_id: payload.mesh_id,
                })
            }
        });

        // TODO：Broadcast move event streams to others in this game room
        const broadcastEvent = (dir: Vector) => {
            socket.emit('move', { dir })
        }

        // keyboard `keypress` event, we use keyboard to control moving actions
        const evtKeyPress = fromEvent<KeyboardEvent>(document, 'keypress').pipe(
            auditTime(16),
            map((e: KeyboardEvent) => {
                return { evt: 'move', code: e.code }
            })
        )

        // ignore keys other than W/A/S/D
        const keyPress$ = evtKeyPress.pipe(filter(keyPressWASD))

        // stream of direction changing, this will turns w/a/s/d keypress event into direction vector changing streams
        const direction$ = keyPress$.pipe(map(move))

        const accumulator = (acc: Vector | CurrentPositionAndDirection, value: Vector) => {
            const { currPos = POS } = acc as CurrentPositionAndDirection
            return {
                currPos: currPos.add(value),
                dir: value,
            }
        }

        // every direction changing event will cause position movement
        direction$
            .pipe(
                scan(accumulator, POS),
                map(currPosAndDir => boundaryProcess(currPosAndDir, boundary))
            )
            .subscribe(({ currPos, dir, collided }) => {
                renderPosition(currPos)

                setMePositionState({
                    x: currPos.x,
                    y: currPos.y,
                })

                if (!collided) {
                    // emit to others over websocket
                    broadcastEvent(dir)
                }
            })

        // connect to socket.io server
        socket.connect()

        // Add movement transition, it looks smoother
        setTimeout(() => {
            if (refContainer.current) {
                refContainer.current.classList.add('movement-transition')
            }
        }, 1000)
    }, [])

    return (
        <div className='absolute max-h-40 sm:relative sm-grid-card' ref={refContainer}>
            <Webcam cover={avatar} name={name} channel={channel} />
            <div className='absolute top-32 left-1/2 transform -translate-x-1/2 text-base text-white font-bold whitespace-nowrap sm:top-28'>
                {name}
            </div>
            { myLatency && myLatency.latency > 0 && <div className='absolute top-36 left-1/2 transform -translate-x-1/2 text-base text-green-600 font-bold whitespace-nowrap sm:top-30'>{myLatency.latency}ms ({myLatency.mesh_id})</div> }
        </div>
    )
}

export default memo(Me, () => true)
