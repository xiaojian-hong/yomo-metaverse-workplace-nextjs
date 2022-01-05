import { useEffect, useState } from 'react'

import { useSetRecoilState } from 'recoil'
import { mateMapState, matePositionMapState, onlineState } from '../../store/atom'

import { Vector } from '../../libs/movement'
import { Logger } from '../../libs/helper'

import io from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { User, Position } from '../../types'
import mate from '../player/mate'

export default function useSocket({
    me,
    position,
    room,
}: {
    me: User
    position: Position
    room: string
}) {
    const [socket, setSocket] = useState<Socket | null>(null)
    const setMateMapState = useSetRecoilState(mateMapState)
    const setMatePositionMapState = useSetRecoilState(matePositionMapState)
    const setOnlineState = useSetRecoilState(onlineState)

    useEffect(() => {
        if (!me.id) {
            return
        }

        const log = new Logger('Scene', 'color: green; background: yellow')

        // init socket.io client
        const socket: Socket = io(process.env.NEXT_PUBLIC_WEBSOCKET_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: 50,
            autoConnect: false,
        })

        // `playerJoins` event will be occured when user is connected to websocket
        socket.on('playerJoins', mate => {
            log.log('[playerJoins]', mate)
            if (mate.id === me.id) {
                log.log('[online] is Me, ignore', me.id, me.name)
                return
            }

            setMateMapState(old => {
                if (old.has(mate.id)) {
                    return old
                }

                mate.pos = new Vector(position.x, position.y)
                const mateMap = new Map(old)
                mateMap.set(mate.id, mate)
                return mateMap
            })
        })

        // `playerExits` event will be occured when other users leave
        socket.on('playerExits', payload => {
            log.log('[playerExits]', payload.id)
            setMateMapState(old => {
                const mateMap = new Map(old)
                mateMap.delete(payload.id)
                return mateMap
            })

            setMatePositionMapState(old => {
                const matePositionMap = new Map(old)
                matePositionMap.delete(payload.id)
                return matePositionMap
            })
        })

        // `playerSync` event will be occured when new player joins
        socket.on('playerSync', state => {
            log.log('[playerSync]', state, ', Me:', me.id)
            if (state.id === me.id) {
                log.log('[playerSync] is Me, ignore', me.id)
                return
            }

            setMateMapState(old => {
                if (old.has(state.id)) {
                    return old
                }

                const mateMap = new Map(old)
                mateMap.set(state.id, state)
                return mateMap
            })
        })

        // broadcast to others I am online when WebSocket connected
        socket.on('connect', () => {
            // log.log('WS CONNECTED', socket.id, socket.connected)
            socket.emit('enter', { space: room, id: me.id, name: me.name, avatar: me.image })
            setOnlineState(true)
        })

        socket.on('disconnect', () => {
            setOnlineState(false)
        })

        socket.on('connect_error', error => {
            console.error('WS CONNECT_ERROR', error)
            setOnlineState(false)
        })

        setSocket(socket)

        return () => {
            setMateMapState(new Map())
            socket.disconnect('bye')
        }
    }, [me.id])

    return socket
}
