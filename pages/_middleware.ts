import { NextRequest, NextResponse } from 'next/server'
import countryRegion from '../libs/amesh.json'

export async function middleware(req: NextRequest) {
    const { nextUrl: url, geo } = req
    const country = url.searchParams.get('country') || geo.country
    const mesh = getMeshID(country)

    url.searchParams.set('country', country as string)
    url.searchParams.set('region', mesh || '')

    return NextResponse.rewrite(url)
}

// 4 mesh nodes
function getMeshID(country: string | undefined): string | undefined {
    if (country == undefined) {
        return process.env.NEXT_PUBLIC_WEBSOCKET_URL_US
    }

    if (country === 'CN') {
        return process.env.NEXT_PUBLIC_WEBSOCKET_URL_CN
    }

    const res = countryRegion.find((item: { name: string; region: string }) => {
        if (item.name === country) {
            return item.region
        }
    })

    if (!res) {
        return process.env.NEXT_PUBLIC_WEBSOCKET_URL_US
    }

    switch (res.region) {
        case 'Asia':
            return process.env.NEXT_PUBLIC_WEBSOCKET_URL_KR
        case 'Europe':
            return process.env.NEXT_PUBLIC_WEBSOCKET_URL_DE
        default:
            return process.env.NEXT_PUBLIC_WEBSOCKET_URL_US
    }
}
